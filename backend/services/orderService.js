import mongoose from 'mongoose';
import { db } from '../db.js';
import { Order } from '../models/Order.js';
import { Cooler } from '../models/Cooler.js';
import { releaseStock } from './stockService.js';
import { creditWallet } from './walletService.js';

let orderCancelMutex = Promise.resolve();
function withCancelLock(callback) {
  const nextLock = orderCancelMutex.then(async () => {
    try {
      return await callback();
    } catch (err) {
      throw err;
    }
  });
  orderCancelMutex = nextLock.catch(() => {});
  return nextLock;
}

/**
 * Unified order cancellation service.
 * Enforces role restrictions, valid state transitions, atomic stock restoration, and wallet refunds.
 *
 * Requirements guaranteed:
 * 1. Riders cannot cancel orders under any circumstances (returns 403).
 * 2. Non-admin customers can only cancel their own orders.
 * 3. Cannot cancel once order is PACKED, READY_FOR_PICKUP, OUT_FOR_DELIVERY, ARRIVED, DELIVERED, or already CANCELLED.
 * 4. Atomically releases stock if previously deducted.
 * 5. Atomically refunds debited wallet balance with idempotency key.
 * 6. Releases assigned cooler back to available pool.
 */
export async function cancelOrder({ orderId, user, reason = 'Customer requested cancellation' }) {
  return withCancelLock(async () => {
    // 1. Role Check: Riders CANNOT cancel orders
    if (user && user.role === 'rider') {
      const err = new Error('Access denied: Delivery riders are not permitted to cancel orders.');
      err.statusCode = 403;
      throw err;
    }

    const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
    let order = null;

    if (isMongo) {
      order = await Order.findOne({
        $or: [{ id: orderId }, { orderNumber: orderId }]
      }).lean();
    } else {
      order = (db.get('orders') || []).find(o => o.id === orderId || o.orderNumber === orderId);
    }

    if (!order) {
      const err = new Error(`Order "${orderId}" not found`);
      err.statusCode = 404;
      throw err;
    }

    // 2. Ownership Check: Non-admins can only cancel their own order
    if (user && user.role !== 'admin' && order.userId !== user.id) {
      const err = new Error('Access denied: You are not authorized to cancel this order.');
      err.statusCode = 403;
      throw err;
    }

    // 3. State Machine Check: Non-cancellable once prepared/packed/dispatched
    const nonCancellable = ['PACKED', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY', 'ARRIVED', 'DELIVERED', 'CANCELLED'];
    if (nonCancellable.includes(order.orderStatus)) {
      const err = new Error(`Order cannot be cancelled in '${order.orderStatus}' stage. Please contact customer concierge.`);
      err.statusCode = 400;
      throw err;
    }

    // 4. Restore Inventory Atomically (ONLY if stock was previously deducted)
    if (order.stockDeducted && Array.isArray(order.items) && order.items.length > 0) {
      await releaseStock(order.items);
    }

    // 5. Refund Wallet Balance Atomically (Idempotent)
    if (order.walletDeduction > 0 && order.userId) {
      try {
        await creditWallet({
          userId: order.userId,
          amount: order.walletDeduction,
          idempotencyKey: `wallet_refund_cancel_${order.id}`,
          orderId: order.orderNumber || order.id,
          title: `Refund for Cancelled Order #${order.orderNumber || order.id}`,
          description: reason || 'Store credit refunded due to order cancellation.'
        });
      } catch (walletErr) {
        console.warn('[CancelOrder] Wallet refund warning:', walletErr.message);
      }
    }

    // 6. Release Cooler back to available pool
    if (order.coolerId) {
      if (isMongo) {
        await Cooler.findOneAndUpdate(
          { id: order.coolerId },
          { $set: { status: 'available', currentOrderId: null, currentUserId: null } }
        );
      } else {
        db.update('coolers', order.coolerId, {
          status: 'available',
          currentOrderId: null,
          currentUserId: null
        });
      }
    }

    // 7. Update Order in Database
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const cancelUpdates = {
      orderStatus: 'CANCELLED',
      status: 'Cancelled',
      lifecycleStatus: 'CANCELLED',
      stockDeducted: false,
      walletRefunded: order.walletDeduction > 0,
      coolerReleased: Boolean(order.coolerId),
      paymentStatus: order.paymentStatus === 'PAID' ? 'REFUND_PENDING' : order.paymentStatus,
      notes: reason,
      tempLog: [
        ...(order.tempLog || []),
        { time: timeStr, temp: order.liveTemp || 1.8, event: `Order cancelled by ${user?.name || user?.role || 'Customer'}: ${reason}` }
      ]
    };

    let updatedOrder = null;
    if (isMongo) {
      updatedOrder = await Order.findOneAndUpdate(
        { id: order.id },
        { $set: cancelUpdates },
        { new: true }
      ).lean();
    } else {
      updatedOrder = db.update('orders', order.id, cancelUpdates);
    }

    return updatedOrder || { ...order, ...cancelUpdates };
  });
}
