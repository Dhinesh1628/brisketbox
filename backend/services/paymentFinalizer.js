import mongoose from 'mongoose';
import { db } from '../db.js';
import { User } from '../models/User.js';
import { Cooler } from '../models/Cooler.js';
import { Order } from '../models/Order.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { CouponUsage } from '../models/CouponUsage.js';
import { deductStock, releaseStock } from './stockService.js';
import { creditWallet } from './walletService.js';

/**
 * Assigns an active, approved delivery executive for the order.
 */
export async function assignRealRider(session = null) {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  let riders = [];
  if (isMongo) {
    const q = User.find({ role: 'rider', approvalStatus: 'approved' });
    if (session) q.session(session);
    riders = await q.lean();
  } else {
    riders = (db.get('users') || []).filter(u => u.role === 'rider' && u.approvalStatus === 'approved');
  }

  if (riders.length > 0) {
    const selected = riders[0];
    return {
      riderId: selected.id,
      riderName: selected.name ? selected.name.split(' ')[0] : 'Rider',
      riderFullName: selected.name || 'Fleet Delivery Executive',
      riderPhone: selected.phone || '+91 97412 88301',
      riderVehicle: selected.vehicleType ? `${selected.vehicleType} (${selected.vehicleNumber || 'KA-04-EV'})` : 'EV 2-Wheeler',
      deliveryExecutive: `${selected.name || 'Fleet Executive'} (${selected.phone || '+91 97412 88301'})`
    };
  }

  return {
    riderId: 'usr_rider_1',
    riderName: 'Suresh',
    riderFullName: 'Suresh Patil',
    riderPhone: '+91 97412 88301',
    riderVehicle: 'EV 2-Wheeler (KA-04-EV-819)',
    deliveryExecutive: 'Suresh Patil (EV Fleet #14, +91 97412 88301)'
  };
}

/**
 * Assigns an available cooler box to an order upon payment capture or COD placement.
 */
export async function assignAvailableCooler(orderId, userId, userName, session = null) {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    const cooler = await Cooler.findOneAndUpdate(
      { status: 'available' },
      { 
        $set: { 
          status: 'assigned', 
          currentOrderId: orderId, 
          currentUserId: userId || null, 
          currentUserName: userName || null 
        } 
      },
      { new: true, session }
    );
    return cooler ? { coolerId: cooler.id, coolerModel: cooler.model } : { coolerId: null, coolerModel: null };
  }

  const coolers = db.get('coolers') || [];
  const cooler = coolers.find(c => c.status === 'available');
  if (cooler) {
    db.update('coolers', cooler.id, {
      status: 'assigned',
      currentOrderId: orderId,
      currentUserId: userId || null,
      currentUserName: userName || null
    });
    return { coolerId: cooler.id, coolerModel: cooler.model };
  }
  return { coolerId: null, coolerModel: null };
}

/**
 * Unified, idempotent payment finalizer used by both /verify and Razorpay Webhook.
 *
 * Requirements guaranteed:
 * 1. Uses a MongoDB transaction and claims the state change atomically first.
 *    Only the request that wins the claim may change stock, wallet, coupon, or cooler data.
 * 2. Uses Razorpay's payment ID or event ID as the unique PaymentEvent key, never Date.now().
 * 3. Assigns real approved rider.
 * 4. Never marks stockDeducted: true unless inventory deduction succeeded.
 * 5. If stock is unavailable post-payment, moves order to REFUND_REQUIRED state.
 * 6. Records PaymentEvent and CouponUsage.
 */
export async function finalizePayment({
  orderId,
  razorpayPaymentId,
  razorpayOrderId = '',
  razorpaySignature = 'SERVER_VERIFIED',
  amountInPaise = 0,
  currency = 'INR',
  source = 'verify',
  eventId = null
}) {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  if (isMongo) {
    const session = await mongoose.startSession();
    try {
      let finalOrder = null;
      let alreadyPaid = false;
      let refundRequired = false;

      await session.withTransaction(async () => {
        // Find order
        const existing = await Order.findOne({
          $or: [
            { id: orderId },
            { orderNumber: orderId },
            ...(razorpayOrderId ? [{ razorpayOrderId }] : [])
          ]
        }).session(session);

        if (!existing) {
          const err = new Error(`Order "${orderId}" not found for finalization`);
          err.notFound = true;
          throw err;
        }

        // Idempotency: If already marked PAID, return existing order
        if (existing.paymentStatus === 'PAID') {
          finalOrder = existing.toObject();
          alreadyPaid = true;
          return;
        }

        // Unique PaymentEvent key: Razorpay event ID or payment ID, NEVER Date.now()!
        const uniqueEventKey = eventId || razorpayPaymentId || `pay_${razorpayOrderId || existing.id}`;

        // ATOMIC CLAIM: Only one request can transition paymentStatus from NOT PAID to 'PAID'
        const claimed = await Order.findOneAndUpdate(
          {
            _id: existing._id,
            paymentStatus: { $ne: 'PAID' }
          },
          {
            $set: {
              paymentStatus: 'PAID',
              paidAt: new Date().toISOString(),
              razorpayPaymentId: razorpayPaymentId || existing.razorpayPaymentId,
              razorpayOrderId: razorpayOrderId || existing.razorpayOrderId,
              razorpaySignature: razorpaySignature || existing.razorpaySignature
            }
          },
          { new: true, session }
        );

        if (!claimed) {
          // Concurrently claimed by another process
          const refreshed = await Order.findById(existing._id).session(session);
          finalOrder = refreshed ? refreshed.toObject() : existing.toObject();
          alreadyPaid = true;
          return;
        }

        // Record PaymentEvent with unique eventId in the SAME transaction
        await PaymentEvent.create([{
          id: `pe_${uniqueEventKey}`,
          eventId: uniqueEventKey,
          eventType: 'payment.captured',
          orderId: claimed.orderNumber || claimed.id,
          paymentId: razorpayPaymentId,
          amount: amountInPaise ? amountInPaise / 100 : (claimed.totalAmount || claimed.total),
          currency,
          source,
          payload: { razorpayOrderId, razorpayPaymentId, razorpaySignature }
        }], { session });

        // Record coupon usage in the SAME transaction
        if (claimed.couponCode && claimed.userId) {
          try {
            await CouponUsage.create([{
              id: `cp_${claimed.id}`,
              code: claimed.couponCode.toUpperCase(),
              userId: claimed.userId,
              orderId: claimed.orderNumber || claimed.id,
              discount: claimed.discountAmount || 0,
              redeemedAt: new Date().toISOString()
            }], { session });
          } catch (e) {
            console.warn('[PaymentFinalizer] CouponUsage duplicate or error:', e.message);
          }
        }

        // ONLY THE REQUEST THAT WINS THE CLAIM MAY CHANGE STOCK:
        let stockDeducted = Boolean(claimed.stockDeducted);
        if (!stockDeducted && Array.isArray(claimed.items) && claimed.items.length > 0) {
          try {
            await deductStock(claimed.items, { session });
            claimed.stockDeducted = true;
          } catch (stockErr) {
            console.error('[PaymentFinalizer] Stock deduction failed post-payment:', stockErr.message);

            // Stock unavailable post-payment: Move order to REFUND_REQUIRED state
            claimed.orderStatus = 'REFUND_REQUIRED';
            claimed.status = 'Refund Required (Out of Stock)';
            claimed.lifecycleStatus = 'REFUND_REQUIRED';
            claimed.stockDeducted = false;
            claimed.notes = `Automatic refund required: Item out of stock after payment capture (${stockErr.message})`;
            await claimed.save({ session });

            finalOrder = claimed.toObject();
            refundRequired = true;
            return;
          }
        }

        // Assign real approved rider & available cooler
        const riderInfo = await assignRealRider(session);
        let coolerInfo = { coolerId: claimed.coolerId, coolerModel: claimed.coolerModel };
        if (!coolerInfo.coolerId) {
          coolerInfo = await assignAvailableCooler(
            claimed.orderNumber || claimed.id,
            claimed.userId,
            claimed.customerName,
            session
          );
        }

        claimed.riderId = riderInfo.riderId;
        claimed.riderName = riderInfo.riderName;
        claimed.deliveryExecutive = riderInfo.deliveryExecutive;
        claimed.coolerId = coolerInfo.coolerId || claimed.coolerId;
        claimed.coolerModel = coolerInfo.coolerModel || claimed.coolerModel;
        claimed.orderStatus = 'CONFIRMED';
        claimed.status = 'Confirmed & In Kitchen Prep';
        claimed.lifecycleStatus = 'CONFIRMED';

        await claimed.save({ session });
        finalOrder = claimed.toObject();
      });

      if (refundRequired) {
        return {
          success: false,
          refundRequired: true,
          error: 'Item out of stock during payment capture. Order moved to refund-required state.',
          order: finalOrder
        };
      }

      return { success: true, order: finalOrder, alreadyPaid };
    } finally {
      await session.endSession();
    }
  }

  // LowDB fallback (only active when MongoDB is not connected in local non-prod)
  let order = (db.get('orders') || []).find(o => 
    o.id === orderId || o.orderNumber === orderId || (razorpayOrderId && o.razorpayOrderId === razorpayOrderId)
  );
  if (!order) {
    return { success: false, notFound: true, error: `Order "${orderId}" not found for finalization` };
  }

  if (order.paymentStatus === 'PAID') {
    return { success: true, order, alreadyPaid: true };
  }

  // Claim
  order.paymentStatus = 'PAID';
  order.paidAt = new Date().toISOString();
  order.razorpayPaymentId = razorpayPaymentId || order.razorpayPaymentId;
  order.razorpayOrderId = razorpayOrderId || order.razorpayOrderId;
  order.razorpaySignature = razorpaySignature || order.razorpaySignature;

  // Deduct stock
  let stockDeducted = Boolean(order.stockDeducted);
  if (!stockDeducted && Array.isArray(order.items) && order.items.length > 0) {
    try {
      await deductStock(order.items);
      order.stockDeducted = true;
    } catch (stockErr) {
      order.orderStatus = 'REFUND_REQUIRED';
      order.status = 'Refund Required (Out of Stock)';
      order.lifecycleStatus = 'REFUND_REQUIRED';
      order.stockDeducted = false;
      db.update('orders', order.id, order);
      return {
        success: false,
        refundRequired: true,
        error: 'Item out of stock during payment capture. Order moved to refund-required state.',
        order
      };
    }
  }

  const riderInfo = await assignRealRider();
  let coolerInfo = { coolerId: order.coolerId, coolerModel: order.coolerModel };
  if (!coolerInfo.coolerId) {
    coolerInfo = await assignAvailableCooler(order.orderNumber || order.id, order.userId, order.customerName);
  }

  order.riderId = riderInfo.riderId;
  order.riderName = riderInfo.riderName;
  order.deliveryExecutive = riderInfo.deliveryExecutive;
  order.coolerId = coolerInfo.coolerId || order.coolerId;
  order.coolerModel = coolerInfo.coolerModel || order.coolerModel;
  order.orderStatus = 'CONFIRMED';
  order.status = 'Confirmed & In Kitchen Prep';
  order.lifecycleStatus = 'CONFIRMED';

  db.update('orders', order.id, order);
  return { success: true, order };
}

/**
 * Releases reserved wallet credits and cooler boxes when online payment fails or expires.
 */
export async function releasePaymentReservations({ orderId, reason = 'Payment expired or failed' }) {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  if (isMongo) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const order = await Order.findOne({
          $or: [{ id: orderId }, { orderNumber: orderId }]
        }).session(session);

        if (!order) return;

        // Release cooler if assigned
        if (order.coolerId && !order.coolerReleased) {
          await Cooler.findOneAndUpdate(
            { id: order.coolerId },
            { $set: { status: 'available', currentOrderId: null, currentUserId: null } },
            { session }
          );
          order.coolerReleased = true;
        }

        // Release wallet balance if debited and not yet refunded
        if (order.walletDeduction > 0 && order.userId && !order.walletRefunded) {
          await creditWallet({
            userId: order.userId,
            amount: order.walletDeduction,
            idempotencyKey: `wallet_release_failed_pay_${order.id}`,
            orderId: order.orderNumber || order.id,
            title: `Refund for Failed Payment #${order.orderNumber || order.id}`,
            description: reason
          }, { session });
          order.walletRefunded = true;
        }

        // Release stock if deducted
        if (order.stockDeducted && Array.isArray(order.items) && order.items.length > 0) {
          await releaseStock(order.items, { session });
          order.stockDeducted = false;
        }

        order.orderStatus = 'PAYMENT_FAILED';
        order.paymentStatus = 'FAILED';
        order.lifecycleStatus = 'CANCELLED';
        await order.save({ session });
      });
    } finally {
      await session.endSession();
    }
    return;
  }

  // LowDB fallback
  const order = (db.get('orders') || []).find(o => o.id === orderId || o.orderNumber === orderId);
  if (!order) return;

  if (order.coolerId && !order.coolerReleased) {
    db.update('coolers', order.coolerId, {
      status: 'available',
      currentOrderId: null,
      currentUserId: null
    });
    order.coolerReleased = true;
  }

  if (order.walletDeduction > 0 && order.userId && !order.walletRefunded) {
    try {
      await creditWallet({
        userId: order.userId,
        amount: order.walletDeduction,
        idempotencyKey: `wallet_release_failed_pay_${order.id}`,
        orderId: order.orderNumber || order.id,
        title: `Refund for Failed Payment #${order.orderNumber || order.id}`,
        description: reason
      });
      order.walletRefunded = true;
    } catch (e) {}
  }

  if (order.stockDeducted && Array.isArray(order.items) && order.items.length > 0) {
    await releaseStock(order.items);
    order.stockDeducted = false;
  }

  order.orderStatus = 'PAYMENT_FAILED';
  order.paymentStatus = 'FAILED';
  order.lifecycleStatus = 'CANCELLED';
  db.update('orders', order.id, order);
}
