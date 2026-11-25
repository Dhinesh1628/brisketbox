import mongoose from 'mongoose';
import { db } from '../db.js';
import { Order } from '../models/Order.js';
import { Cooler } from '../models/Cooler.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { releaseStock } from './stockService.js';
import { creditWallet } from './walletService.js';
import { releaseDeliverySlot } from './deliverySlotService.js';

/**
 * Unified order cancellation service.
 * Enforces role restrictions, valid state transitions, atomic stock restoration, and wallet refunds.
 *
 * Requirements guaranteed:
 * 1. Riders cannot cancel orders under any circumstances (returns 403).
 * 2. Non-admin customers can only cancel their own orders.
 * 3. Uses a MongoDB transaction and claims the state change atomically first.
 *    Only the request that wins the claim may change stock, wallet, or cooler data.
 * 4. Cannot cancel once order is PACKED, READY_FOR_PICKUP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, or already CANCELLED.
 * 5. Atomically releases stock if previously deducted.
 * 6. Atomically refunds debited wallet balance with unique WalletLedger entry.
 * 7. Releases assigned cooler back to available pool.
 */
export async function cancelOrder({ orderId, user, reason = 'Customer requested cancellation' }) {
  // 1. Role Check: Riders CANNOT cancel orders
  if (user && user.role === 'rider') {
    const err = new Error('Access denied: Delivery riders are not permitted to cancel orders.');
    err.statusCode = 403;
    throw err;
  }

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  if (isMongo) {
    const session = await mongoose.startSession();
    try {
      let cancelledOrder = null;

      await session.withTransaction(async () => {
        // Find existing order
        const existing = await Order.findOne({
          $or: [{ id: orderId }, { orderNumber: orderId }]
        }).session(session);

        if (!existing) {
          const err = new Error(`Order "${orderId}" not found`);
          err.statusCode = 404;
          throw err;
        }

        // Ownership Check: Non-admins can only cancel their own order
        if (user && user.role !== 'admin' && existing.userId !== user.id) {
          const err = new Error('Access denied: You are not authorized to cancel this order.');
          err.statusCode = 403;
          throw err;
        }

        // State Check: Non-cancellable once prepared/packed/dispatched
        const nonCancellable = ['PACKED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED', 'CANCELLED'];
        if (nonCancellable.includes(existing.orderStatus)) {
          const err = new Error(`Order cannot be cancelled in '${existing.orderStatus}' stage. Please contact customer concierge.`);
          err.statusCode = 400;
          throw err;
        }

        // ATOMIC CLAIM: Only transitions from cancellable statuses to 'CANCELLED'
        // If another concurrent request on Process A or B already claimed it, this returns null!
        const claimed = await Order.findOneAndUpdate(
          {
            _id: existing._id,
            orderStatus: { $in: ['PLACED', 'CONFIRMED', 'PENDING_PAYMENT', 'CREATED'] }
          },
          {
            $set: {
              orderStatus: 'CANCELLED',
              lifecycleStatus: 'CANCELLED',
              cancellationReason: reason,
              cancelledAt: new Date().toISOString()
            }
          },
          { new: true, session }
        );

        if (!claimed) {
          const err = new Error(`Order cannot be cancelled in '${existing.orderStatus}' stage. Please contact customer concierge.`);
          err.statusCode = 400;
          throw err;
        }

        // ONLY THE REQUEST THAT WINS THE CLAIM MAY CHANGE STOCK, WALLET, OR COOLER DATA:

        // 1. Paid Online Cancellation & Refund Record:
        // Cancelling a PAID online order must atomically set a refund state and create exactly one refund record.
        // Include the correct amount. Wallet and Razorpay portions must be handled separately. Never leave it as PAID with no refund.
        if (existing.paymentStatus === 'PAID') {
          if (claimed.totalAmount > 0) {
            claimed.paymentStatus = 'REFUND_PENDING';
            claimed.refundAmount = claimed.totalAmount;
            claimed.refundId = `rfnd_${claimed.razorpayPaymentId || claimed.id}`;
            claimed.status = 'Cancelled & Refund Initiated';

            const refundEventKey = `rfnd_${claimed.razorpayPaymentId || claimed.id}`;
            await PaymentEvent.create([{
              id: `pe_${refundEventKey}`,
              eventId: refundEventKey,
              eventType: 'refund.created',
              orderId: claimed.orderNumber || claimed.id,
              paymentId: claimed.razorpayPaymentId,
              amount: claimed.totalAmount,
              currency: 'INR',
              source: 'cancellation',
              payload: { reason, refundType: 'gateway', amount: claimed.totalAmount }
            }], { session });

            await Order.updateOne({ _id: claimed._id }, {
              $set: {
                paymentStatus: 'REFUND_PENDING',
                refundAmount: claimed.totalAmount,
                refundId: claimed.refundId,
                status: claimed.status
              }
            }, { session });
          } else if (claimed.walletDeduction > 0) {
            claimed.paymentStatus = 'REFUNDED';
            claimed.status = 'Cancelled & Store Credit Refunded';
            await Order.updateOne({ _id: claimed._id }, {
              $set: {
                paymentStatus: 'REFUNDED',
                status: claimed.status
              }
            }, { session });
          }
        }

        // 2. Restore Inventory Atomically (ONLY if stock was previously deducted)
        if (claimed.stockDeducted && Array.isArray(claimed.items) && claimed.items.length > 0) {
          await releaseStock(claimed.items, { session });
          claimed.stockDeducted = false;
          await Order.updateOne({ _id: claimed._id }, { $set: { stockDeducted: false } }, { session });
        }

        // 3. Refund Wallet Balance Atomically with unique WalletLedger entry (handled separately from gateway)
        if (claimed.walletDeduction > 0 && claimed.userId && !claimed.walletRefunded) {
          await creditWallet({
            userId: claimed.userId,
            amount: claimed.walletDeduction,
            idempotencyKey: `wallet_refund_cancel_${claimed.id}`,
            orderId: claimed.orderNumber || claimed.id,
            title: `Refund for Cancelled Order #${claimed.orderNumber || claimed.id}`,
            description: reason || 'Store credit refunded due to order cancellation.'
          }, { session });
          claimed.walletRefunded = true;
          await Order.updateOne({ _id: claimed._id }, { $set: { walletRefunded: true } }, { session });
        }

        // 4. Release Cooler back to available pool
        if (claimed.coolerId && !claimed.coolerReleased) {
          await Cooler.findOneAndUpdate(
            { id: claimed.coolerId },
            { $set: { status: 'available', currentOrderId: null, currentUserId: null } },
            { session }
          );
          claimed.coolerReleased = true;
          await Order.updateOne({ _id: claimed._id }, { $set: { coolerReleased: true } }, { session });
        }

        // 5. Release Delivery Slot atomically and idempotently
        if (claimed.deliverySlotId && !claimed.slotReleased) {
          const isConfirmed = claimed.paymentStatus === 'PAID' || (claimed.paymentMethod && claimed.paymentMethod.toLowerCase().includes('cash on delivery'));
          await releaseDeliverySlot({
            slotId: claimed.deliverySlotId,
            orderId: claimed.orderNumber || claimed.id,
            isConfirmed
          });
          claimed.slotReleased = true;
          await Order.updateOne({ _id: claimed._id }, { $set: { slotReleased: true } }, { session });
        }

        cancelledOrder = claimed.toObject();
      });

      return cancelledOrder;
    } finally {
      await session.endSession();
    }
  }

  // LowDB fallback (only active when MongoDB is not connected in local non-prod)
  const order = (db.get('orders') || []).find(o => o.id === orderId || o.orderNumber === orderId);
  if (!order) {
    const err = new Error(`Order "${orderId}" not found`);
    err.statusCode = 404;
    throw err;
  }

  if (user && user.role !== 'admin' && order.userId !== user.id) {
    const err = new Error('Access denied: You are not authorized to cancel this order.');
    err.statusCode = 403;
    throw err;
  }

  const nonCancellable = ['PACKED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED', 'CANCELLED'];
  if (nonCancellable.includes(order.orderStatus)) {
    const err = new Error(`Order cannot be cancelled in '${order.orderStatus}' stage. Please contact customer concierge.`);
    err.statusCode = 400;
    throw err;
  }

  // Atomically claim in memory
  order.orderStatus = 'CANCELLED';
  order.lifecycleStatus = 'CANCELLED';
  order.cancellationReason = reason;
  order.cancelledAt = new Date().toISOString();

  if (order.stockDeducted && Array.isArray(order.items) && order.items.length > 0) {
    await releaseStock(order.items);
    order.stockDeducted = false;
  }

  if (order.walletDeduction > 0 && order.userId && !order.walletRefunded) {
    try {
      await creditWallet({
        userId: order.userId,
        amount: order.walletDeduction,
        idempotencyKey: `wallet_refund_cancel_${order.id}`,
        orderId: order.orderNumber || order.id,
        title: `Refund for Cancelled Order #${order.orderNumber || order.id}`,
        description: reason || 'Store credit refunded due to order cancellation.'
      });
      order.walletRefunded = true;
    } catch (e) {}
  }

  if (order.coolerId && !order.coolerReleased) {
    db.update('coolers', order.coolerId, {
      status: 'available',
      currentOrderId: null,
      currentUserId: null
    });
    order.coolerReleased = true;
  }

  if (order.deliverySlotId && !order.slotReleased) {
    const isConfirmed = order.paymentStatus === 'PAID' || (order.paymentMethod && order.paymentMethod.toLowerCase().includes('cash on delivery'));
    await releaseDeliverySlot({
      slotId: order.deliverySlotId,
      orderId: order.orderNumber || order.id,
      isConfirmed
    });
    order.slotReleased = true;
  }

  db.update('orders', order.id, order);
  return order;
}
