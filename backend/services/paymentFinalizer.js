import mongoose from 'mongoose';
import { db } from '../db.js';
import { User } from '../models/User.js';
import { Cooler } from '../models/Cooler.js';
import { Order } from '../models/Order.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { CouponUsage } from '../models/CouponUsage.js';
import { deductStock, releaseStock } from './stockService.js';
import { creditWallet, debitWallet } from './walletService.js';
import { assignFleetRiderForOrder } from '../dispatch.js';
import { confirmDeliverySlotHold, releaseDeliverySlot } from './deliverySlotService.js';

/**
 * Assigns an active, approved delivery executive for the order.
 * If no approved rider is available, keeps riderId null so it displays in admin dispatch queue.
 */
export async function assignRealRider(session = null) {
  return await assignFleetRiderForOrder(session);
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
    let stockFailureError = null;
    let targetOrderForRecovery = null;
    let uniqueEventKeyForRecovery = null;

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

        targetOrderForRecovery = existing;

        // Idempotency: If already marked PAID, return existing order
        if (existing.paymentStatus === 'PAID') {
          finalOrder = existing.toObject();
          alreadyPaid = true;
          return;
        }

        // Unique PaymentEvent key: Razorpay event ID or payment ID, NEVER Date.now()!
        const uniqueEventKey = eventId || razorpayPaymentId || `pay_${razorpayOrderId || existing.id}`;
        uniqueEventKeyForRecovery = uniqueEventKey;

        // 1. LATE PAYMENT AFTER CANCEL / EXPIRED:
        // A captured webhook for a CANCELLED or expired order must never make it CONFIRMED,
        // deduct stock, or keep a wallet refund. Record the payment and move the order to REFUND_REQUIRED.
        const isCancelledOrDead = ['CANCELLED', 'EXPIRED'].includes(existing.orderStatus) || 
                                  ['CANCELLED', 'EXPIRED', 'REFUND_REQUIRED'].includes(existing.paymentStatus);

        if (isCancelledOrDead) {
          await PaymentEvent.create([{
            id: `pe_${uniqueEventKey}`,
            eventId: uniqueEventKey,
            eventType: 'payment.captured',
            orderId: existing.orderNumber || existing.id,
            paymentId: razorpayPaymentId,
            amount: amountInPaise ? amountInPaise / 100 : (existing.totalAmount || existing.total),
            currency,
            source,
            payload: { razorpayOrderId, razorpayPaymentId, razorpaySignature, latePayment: true }
          }], { session });

          existing.orderStatus = 'REFUND_REQUIRED';
          existing.paymentStatus = 'REFUND_REQUIRED';
          existing.lifecycleStatus = 'REFUND_REQUIRED';
          existing.status = 'Payment Captured on Cancelled Order (Refund Required)';
          existing.refundAmount = amountInPaise ? amountInPaise / 100 : (existing.totalAmount || existing.total);
          existing.notes = 'Late payment captured after order was cancelled or expired. Auto-refund required.';
          existing.razorpayPaymentId = razorpayPaymentId || existing.razorpayPaymentId;
          existing.razorpayOrderId = razorpayOrderId || existing.razorpayOrderId;
          await existing.save({ session });

          finalOrder = existing.toObject();
          refundRequired = true;
          return;
        }

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

        // RE-DEBIT WALLET ON RETRY: If wallet money was released on failure/expiry, re-debit it before accepting payment
        if (claimed.walletDeduction > 0 && claimed.walletRefunded) {
          const userBefore = await User.findOne({ id: claimed.userId }).session(session);
          if (!userBefore || (userBefore.walletBalance || 0) < claimed.walletDeduction) {
            console.warn(`[PaymentFinalizer] User has insufficient wallet balance on payment retry (${userBefore?.walletBalance || 0} < ${claimed.walletDeduction}). Order moved to REFUND_REQUIRED.`);
            claimed.orderStatus = 'REFUND_REQUIRED';
            claimed.paymentStatus = 'REFUND_REQUIRED';
            claimed.lifecycleStatus = 'REFUND_REQUIRED';
            claimed.status = 'Refund Required (Insufficient wallet balance on retry)';
            claimed.stockDeducted = false;
            await claimed.save({ session });

            finalOrder = claimed.toObject();
            refundRequired = true;
            return;
          }

          await debitWallet({
            userId: claimed.userId,
            amount: claimed.walletDeduction,
            idempotencyKey: `wallet_redebit_retry_${claimed.id}`,
            orderId: claimed.orderNumber || claimed.id,
            title: `Payment Retry for Order #${claimed.orderNumber || claimed.id}`,
            description: `Re-applied ₹${claimed.walletDeduction} wallet balance on payment retry.`
          }, { session });
          claimed.walletRefunded = false;
          claimed.walletDebited = true;
        }

        // MULTI-ITEM ATOMIC STOCK DEDUCTION:
        // If any item is unavailable during payment finalization, no stock from that order may be deducted.
        // We let deductStock throw so the transaction aborts and rolls back completely!
        let stockDeducted = Boolean(claimed.stockDeducted);
        if (!stockDeducted && Array.isArray(claimed.items) && claimed.items.length > 0) {
          await deductStock(claimed.items, { session });
          claimed.stockDeducted = true;
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

        // Convert slot hold to confirmed permanent booking and reset slotReleased on successful payment
        claimed.slotReleased = false;
        if (claimed.deliverySlotId) {
          await confirmDeliverySlotHold({
            slotId: claimed.deliverySlotId,
            orderId: claimed.orderNumber || claimed.id
          });
        }

        await claimed.save({ session });
        finalOrder = claimed.toObject();
      });

      if (refundRequired) {
        return {
          success: false,
          refundRequired: true,
          error: 'Order in refund-required state.',
          order: finalOrder
        };
      }

      return { success: true, order: finalOrder, alreadyPaid };
    } catch (txErr) {
      if (txErr.message && txErr.message.includes('Insufficient stock')) {
        stockFailureError = txErr;
      } else {
        throw txErr;
      }
    } finally {
      await session.endSession();
    }

    // MULTI-ITEM STOCK OUT OF STOCK RECOVERY:
    // The previous transaction was aborted, so ZERO items had their stock deducted.
    // Now record the PaymentEvent and atomically mark the order as REFUND_REQUIRED.
    if (stockFailureError && targetOrderForRecovery) {
      const recoverySession = await mongoose.startSession();
      let recoveryOrder = null;
      try {
        await recoverySession.withTransaction(async () => {
          const uniqueKey = uniqueEventKeyForRecovery || `pay_oos_${targetOrderForRecovery.id}`;
          await PaymentEvent.create([{
            id: `pe_${uniqueKey}`,
            eventId: uniqueKey,
            eventType: 'payment.captured',
            orderId: targetOrderForRecovery.orderNumber || targetOrderForRecovery.id,
            paymentId: razorpayPaymentId,
            amount: amountInPaise ? amountInPaise / 100 : (targetOrderForRecovery.totalAmount || targetOrderForRecovery.total),
            currency,
            source,
            payload: { razorpayOrderId, razorpayPaymentId, razorpaySignature, outOfStock: true }
          }], { session: recoverySession });

          const updated = await Order.findOneAndUpdate(
            { _id: targetOrderForRecovery._id },
            {
              $set: {
                paymentStatus: 'REFUND_REQUIRED',
                orderStatus: 'REFUND_REQUIRED',
                lifecycleStatus: 'REFUND_REQUIRED',
                status: 'Refund Required (Out of Stock)',
                stockDeducted: false,
                refundAmount: amountInPaise ? amountInPaise / 100 : (targetOrderForRecovery.totalAmount || targetOrderForRecovery.total),
                notes: `Automatic refund required: Item out of stock after payment capture (${stockFailureError.message})`,
                razorpayPaymentId: razorpayPaymentId || targetOrderForRecovery.razorpayPaymentId,
                razorpayOrderId: razorpayOrderId || targetOrderForRecovery.razorpayOrderId
              }
            },
            { new: true, session: recoverySession }
          );

          if (updated && updated.walletDebited && updated.walletDeduction > 0 && !updated.walletRefunded) {
            await creditWallet({
              userId: updated.userId,
              amount: updated.walletDeduction,
              idempotencyKey: `wallet_refund_stock_fail_${updated.id}`,
              orderId: updated.orderNumber || updated.id,
              title: `Refund for Out-of-Stock Order #${updated.orderNumber || updated.id}`,
              description: 'Wallet store credit refunded because items were out of stock.'
            }, { session: recoverySession });
            updated.walletRefunded = true;
            await updated.save({ session: recoverySession });
          }

          recoveryOrder = updated ? updated.toObject() : targetOrderForRecovery.toObject();
        });
      } finally {
        await recoverySession.endSession();
      }

      return {
        success: false,
        refundRequired: true,
        error: 'Item out of stock during payment capture. Order moved to refund-required state.',
        order: recoveryOrder
      };
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

  order.slotReleased = false;
  if (order.deliverySlotId) {
    await confirmDeliverySlotHold({
      slotId: order.deliverySlotId,
      orderId: order.orderNumber || order.id
    });
  }

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

        // Strictly act ONLY on an unpaid pending order!
        // An old failed event must NEVER change a PAID or confirmed order!
        if (order.paymentStatus === 'PAID' || ['CONFIRMED', 'DELIVERED', 'COOLER_RETURNED'].includes(order.orderStatus)) {
          console.log(`[ReleasePayment] Order ${order.id} is already PAID/CONFIRMED. Ignoring payment failure/expiry.`);
          return;
        }

        // Atomic claim: Only transition from unpaid pending statuses to 'FAILED'
        const claimed = await Order.findOneAndUpdate(
          {
            _id: order._id,
            paymentStatus: { $ne: 'PAID' },
            orderStatus: { $in: ['PENDING_PAYMENT', 'CREATED', 'PLACED'] }
          },
          {
            $set: {
              orderStatus: 'FAILED',
              paymentStatus: 'FAILED',
              lifecycleStatus: 'CANCELLED',
              status: 'Payment Failed or Expired'
            }
          },
          { new: true, session }
        );

        if (!claimed) {
          return;
        }

        // Release cooler if assigned
        if (claimed.coolerId && !claimed.coolerReleased) {
          await Cooler.findOneAndUpdate(
            { id: claimed.coolerId },
            { $set: { status: 'available', currentOrderId: null, currentUserId: null } },
            { session }
          );
          claimed.coolerReleased = true;
          await Order.updateOne({ _id: claimed._id }, { $set: { coolerReleased: true } }, { session });
        }

        // Release wallet balance exactly once if debited and not yet refunded
        if (claimed.walletDeduction > 0 && claimed.userId && !claimed.walletRefunded) {
          await creditWallet({
            userId: claimed.userId,
            amount: claimed.walletDeduction,
            idempotencyKey: `wallet_release_failed_pay_${claimed.id}`,
            orderId: claimed.orderNumber || claimed.id,
            title: `Refund for Failed Payment #${claimed.orderNumber || claimed.id}`,
            description: reason
          }, { session });
          claimed.walletRefunded = true;
          await Order.updateOne({ _id: claimed._id }, { $set: { walletRefunded: true } }, { session });
        }

        // Release stock if deducted
        if (claimed.stockDeducted && Array.isArray(claimed.items) && claimed.items.length > 0) {
          await releaseStock(claimed.items, { session });
          claimed.stockDeducted = false;
          await Order.updateOne({ _id: claimed._id }, { $set: { stockDeducted: false } }, { session });
        }

        // Release delivery slot hold immediately on payment failure
        if (claimed.deliverySlotId && !claimed.slotReleased) {
          await releaseDeliverySlot({
            slotId: claimed.deliverySlotId,
            orderId: claimed.orderNumber || claimed.id,
            isConfirmed: false
          });
          claimed.slotReleased = true;
          await Order.updateOne({ _id: claimed._id }, { $set: { slotReleased: true } }, { session });
        }
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

  if (order.deliverySlotId && !order.slotReleased) {
    await releaseDeliverySlot({
      slotId: order.deliverySlotId,
      orderId: order.orderNumber || order.id,
      isConfirmed: false
    });
    order.slotReleased = true;
  }

  order.orderStatus = 'PAYMENT_FAILED';
  order.paymentStatus = 'FAILED';
  order.lifecycleStatus = 'CANCELLED';
  db.update('orders', order.id, order);
}
