import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Order } from '../models/Order.js';
import { Refund } from '../models/Refund.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { creditWallet } from './walletService.js';
import { getRazorpayClient } from './razorpayClient.js';

/**
 * Admin Refund Queue: Returns all orders requiring or pending refund.
 */
export async function getRefundQueue(filters = {}) {
  const isMongo = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  if (!isMongo) {
    return [];
  }

  const query = {
    $or: [
      { paymentStatus: { $in: ['REFUND_REQUIRED', 'REFUND_PENDING'] } },
      { orderStatus: { $in: ['REFUND_REQUIRED', 'REFUND_PENDING'] } }
    ]
  };

  const orders = await Order.find(query).sort({ updatedAt: -1 }).lean();
  return orders;
}

/**
 * Admin-Only Idempotent Order Refund Action.
 * 
 * Rules:
 * 1. order.totalAmount is already the Razorpay amount after wallet use. Never subtract walletDeduction again.
 * 2. Gateway refund equals captured Razorpay amount minus any gateway amount already refunded.
 * 3. Wallet money refunded only through the wallet ledger, exactly once.
 * 4. FAILED refund is retryable using one Refund record per order, without duplicate key errors.
 * 5. Uses the same Razorpay idempotency or receipt value for retries.
 * 6. If Razorpay returns pending, keeps the refund PENDING and order NOT REFUNDED.
 * 7. Marks REFUNDED only after gateway confirms processed.
 */
export async function processOrderRefund({
  orderId,
  adminUser,
  reason = 'Admin processed refund',
  idempotencyKey = null,
  customRazorpayClient = null
}) {
  const isMongo = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  if (!isMongo) {
    const err = new Error('Database connection required for refund operations');
    err.statusCode = 503;
    throw err;
  }

  const cleanOrderId = String(orderId || '').trim();
  const derivedKey = idempotencyKey ? String(idempotencyKey).trim() : `admin_refund_${cleanOrderId}`;

  // 1. Fetch order
  const order = await Order.findOne({
    $or: [{ id: cleanOrderId }, { orderNumber: cleanOrderId }]
  });

  if (!order) {
    const err = new Error(`Order "${cleanOrderId}" not found`);
    err.statusCode = 404;
    throw err;
  }

  // Check if order is already marked REFUNDED
  if (order.paymentStatus === 'REFUNDED') {
    const existingSuccess = await Refund.findOne({
      $or: [
        { idempotencyKey: derivedKey },
        { orderId: { $in: [cleanOrderId, order.id, order.orderNumber].filter(Boolean) } }
      ],
      status: 'PROCESSED'
    }).lean();

    return {
      success: true,
      message: 'Order is already marked as REFUNDED',
      idempotent: true,
      refund: existingSuccess,
      order: order.toObject()
    };
  }

  // Verify order is in a refund-eligible state
  const isEligible = ['REFUND_REQUIRED', 'REFUND_PENDING', 'CANCELLED', 'PAID'].includes(order.paymentStatus) ||
                     ['REFUND_REQUIRED', 'REFUND_PENDING', 'CANCELLED'].includes(order.orderStatus);
  if (!isEligible) {
    const err = new Error(`Order status '${order.orderStatus}' / '${order.paymentStatus}' is not eligible for refund.`);
    err.statusCode = 400;
    throw err;
  }

  // 2. Refund Wallet portion through WalletLedger exactly once
  const walletDeduction = Math.max(0, Number(order.walletDeduction) || 0);
  if (walletDeduction > 0 && !order.walletRefunded && order.userId) {
    await creditWallet({
      userId: order.userId,
      amount: walletDeduction,
      idempotencyKey: `wallet_admin_refund_${order.id}`,
      orderId: order.orderNumber || order.id,
      title: `Refund for Order #${order.orderNumber || order.id}`,
      description: reason || 'Store credit refunded by operations.'
    });
    order.walletRefunded = true;
    await Order.updateOne({ _id: order._id }, { $set: { walletRefunded: true } });
  }

  // 3. Calculate exact unrefunded Gateway portion
  // order.totalAmount is already the Razorpay amount after wallet use. DO NOT subtract walletDeduction again!
  const capturedGatewayAmount = Number(order.totalAmount !== undefined ? order.totalAmount : (order.amountInPaise ? order.amountInPaise / 100 : order.total)) || 0;

  // Subtract any gateway amount already refunded for this order
  const processedRefunds = await Refund.find({
    orderId: { $in: [cleanOrderId, order.id, order.orderNumber].filter(Boolean) },
    status: 'PROCESSED'
  }).lean();
  const gatewayAlreadyRefunded = processedRefunds.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const gatewayAmount = Math.max(0, capturedGatewayAmount - gatewayAlreadyRefunded);

  // If order was 100% wallet paid or gateway portion is completely refunded
  if (gatewayAmount === 0) {
    order.paymentStatus = 'REFUNDED';
    order.orderStatus = 'REFUNDED';
    order.lifecycleStatus = 'REFUNDED';
    order.refundAmount = walletDeduction;
    order.status = 'Fully Refunded (Store Credit)';
    await order.save();

    return {
      success: true,
      message: 'Order refunded successfully to store credit',
      type: 'wallet_only',
      refundAmount: walletDeduction,
      order: order.toObject()
    };
  }

  const paymentId = order.razorpayPaymentId;
  if (!paymentId) {
    const err = new Error(`Cannot process gateway refund: No Razorpay payment ID found on order ${cleanOrderId}`);
    err.statusCode = 400;
    throw err;
  }

  // 4. Atomic Refund Record Claim (handles retries & concurrent duplicate clicks)
  let refundRecord = await Refund.findOne({
    $or: [
      { idempotencyKey: derivedKey },
      { orderId: { $in: [cleanOrderId, order.id, order.orderNumber].filter(Boolean) } }
    ]
  });

  if (refundRecord) {
    if (refundRecord.status === 'PROCESSED') {
      return {
        success: true,
        message: 'Refund was already processed successfully',
        idempotent: true,
        refund: refundRecord.toObject(),
        order: order.toObject()
      };
    }

    if (refundRecord.status === 'PENDING') {
      const err = new Error('A refund for this order is currently in-flight. Please wait.');
      err.statusCode = 409;
      throw err;
    }

    if (refundRecord.status === 'FAILED') {
      // RETRY PATH: Atomically claim retry from FAILED -> PENDING on existing record.
      // Reuses the original key so we never hit duplicate key error!
      const claimedRetry = await Refund.findOneAndUpdate(
        { _id: refundRecord._id, status: 'FAILED' },
        {
          $set: {
            status: 'PENDING',
            error: null,
            amount: gatewayAmount,
            reason
          },
          $inc: { attempts: 1 }
        },
        { returnDocument: 'after' }
      );

      if (!claimedRetry) {
        const err = new Error('A refund for this order is currently in-flight. Please wait.');
        err.statusCode = 409;
        throw err;
      }
      refundRecord = claimedRetry;
    }
  } else {
    // INITIAL CREATION: Atomically create PENDING record
    try {
      refundRecord = await Refund.create({
        id: `rfnd_rec_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
        orderId: order.orderNumber || order.id,
        paymentId,
        amount: gatewayAmount,
        currency: 'INR',
        status: 'PENDING',
        idempotencyKey: derivedKey,
        reason,
        attempts: 1
      });
    } catch (dupErr) {
      if (dupErr.code === 11000) {
        const existing = await Refund.findOne({ idempotencyKey: derivedKey });
        if (existing?.status === 'PROCESSED') {
          return { success: true, idempotent: true, refund: existing.toObject(), order: order.toObject() };
        }
        const err = new Error('A refund for this order is currently in-flight. Please wait.');
        err.statusCode = 409;
        throw err;
      }
      throw dupErr;
    }
  }

  // 5. Execute Gateway Call via Injectable Razorpay Client
  const client = customRazorpayClient || getRazorpayClient();
  if (!client) {
    await Refund.updateOne(
      { _id: refundRecord._id },
      { $set: { status: 'FAILED', error: 'Razorpay client not configured' } }
    );
    const err = new Error('Razorpay client not configured (missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET)');
    err.statusCode = 500;
    throw err;
  }

  let rzpResponse;
  try {
    rzpResponse = await client.payments.refund(paymentId, {
      amount: Math.round(gatewayAmount * 100),
      receipt: derivedKey,
      notes: { orderId: order.orderNumber || order.id, reason }
    });
  } catch (gatewayErr) {
    // Gateway FAILED: Mark Refund as FAILED to allow retry. Keep order eligible for retry.
    await Refund.updateOne(
      { _id: refundRecord._id },
      {
        $set: {
          status: 'FAILED',
          error: gatewayErr.message,
          gatewayResponse: { message: gatewayErr.message }
        }
      }
    );

    await Order.updateOne(
      { _id: order._id },
      {
        $set: {
          paymentStatus: 'REFUND_REQUIRED',
          orderStatus: 'REFUND_REQUIRED',
          status: 'Refund Failed at Gateway (Retry Required)'
        }
      }
    );

    const err = new Error(`Razorpay refund failed: ${gatewayErr.message}`);
    err.statusCode = 502;
    throw err;
  }

  // 6. Handle Gateway Response: 'processed' vs 'pending'
  const gatewayRefundId = rzpResponse?.id || `rfnd_${Date.now()}`;
  const rzpStatus = String(rzpResponse?.status || '').toLowerCase();

  if (rzpStatus === 'processed') {
    // Gateway confirmed processed: Mark PROCESSED and order REFUNDED
    await Refund.updateOne(
      { _id: refundRecord._id },
      {
        $set: {
          status: 'PROCESSED',
          refundId: gatewayRefundId,
          gatewayResponse: rzpResponse,
          error: null,
          processedAt: new Date().toISOString()
        }
      }
    );

    order.paymentStatus = 'REFUNDED';
    order.orderStatus = 'REFUNDED';
    order.lifecycleStatus = 'REFUNDED';
    order.refundId = gatewayRefundId;
    order.refundAmount = (Number(order.refundAmount) || 0) + gatewayAmount + (walletDeduction && !order.walletRefunded ? walletDeduction : 0);
    order.status = 'Refunded via Razorpay';
    order.refundProcessedAt = new Date().toISOString();
    await order.save();

    // Record PaymentEvent
    await PaymentEvent.create({
      id: `pe_rfnd_${cleanOrderId}_${Date.now()}`,
      eventId: `rfnd_ev_${cleanOrderId}_${Date.now()}`,
      eventType: 'refund.processed',
      orderId: order.orderNumber || order.id,
      paymentId,
      amount: gatewayAmount,
      currency: 'INR',
      source: 'refund',
      payload: {
        gatewayRefundId,
        gatewayAmount,
        walletAmount: walletDeduction,
        reason,
        adminId: adminUser?.id
      },
      status: 'PROCESSED'
    });

    return {
      success: true,
      message: `₹${gatewayAmount} refunded via Razorpay${walletDeduction > 0 ? ` and ₹${walletDeduction} credited to wallet` : ''}`,
      status: 'PROCESSED',
      refundId: gatewayRefundId,
      refundRecord: await Refund.findById(refundRecord._id).lean(),
      order: order.toObject()
    };
  } else {
    // Razorpay returned pending (or settlement pending):
    // "If Razorpay returns pending, keep the refund PENDING and the order not REFUNDED."
    await Refund.updateOne(
      { _id: refundRecord._id },
      {
        $set: {
          status: 'PENDING',
          refundId: gatewayRefundId,
          gatewayResponse: rzpResponse,
          error: null
        }
      }
    );

    order.paymentStatus = 'REFUND_PENDING';
    order.orderStatus = 'REFUND_PENDING';
    order.refundId = gatewayRefundId;
    order.status = 'Refund Pending Gateway Settlement';
    await order.save();

    return {
      success: true,
      message: `Refund initiated at Razorpay with status '${rzpStatus || 'pending'}'. Order remains REFUND_PENDING until verified webhook or status confirmation.`,
      status: 'PENDING',
      refundId: gatewayRefundId,
      refundRecord: await Refund.findById(refundRecord._id).lean(),
      order: order.toObject()
    };
  }
}

/**
 * Checks live refund status against Razorpay and updates records accordingly.
 */
export async function checkRefundStatus({ orderId, customRazorpayClient = null }) {
  const cleanOrderId = String(orderId || '').trim();
  const order = await Order.findOne({
    $or: [{ id: cleanOrderId }, { orderNumber: cleanOrderId }]
  });
  if (!order) {
    const err = new Error(`Order "${cleanOrderId}" not found`);
    err.statusCode = 404;
    throw err;
  }

  const refund = await Refund.findOne({
    orderId: { $in: [cleanOrderId, order.id, order.orderNumber].filter(Boolean) }
  });

  if (!refund || !refund.refundId) {
    return { status: refund?.status || 'NOT_FOUND', order: order.toObject() };
  }

  const client = customRazorpayClient || getRazorpayClient();
  if (!client || !client.refunds?.fetch) {
    return { status: refund.status, refund: refund.toObject(), order: order.toObject() };
  }

  try {
    const rzpRefund = await client.refunds.fetch(refund.refundId);
    if (rzpRefund && rzpRefund.status === 'processed') {
      await Refund.updateOne(
        { _id: refund._id },
        {
          $set: {
            status: 'PROCESSED',
            gatewayResponse: rzpRefund,
            processedAt: new Date().toISOString()
          }
        }
      );
      order.paymentStatus = 'REFUNDED';
      order.orderStatus = 'REFUNDED';
      order.lifecycleStatus = 'REFUNDED';
      order.status = 'Refunded via Razorpay';
      order.refundProcessedAt = new Date().toISOString();
      await order.save();
    } else if (rzpRefund && rzpRefund.status === 'failed') {
      await Refund.updateOne(
        { _id: refund._id },
        {
          $set: {
            status: 'FAILED',
            error: rzpRefund.error_description || 'Refund failed at gateway',
            gatewayResponse: rzpRefund
          }
        }
      );
      order.paymentStatus = 'REFUND_REQUIRED';
      order.orderStatus = 'REFUND_REQUIRED';
      order.status = 'Refund Failed at Gateway (Retry Required)';
      await order.save();
    }
  } catch (e) {
    console.warn('[checkRefundStatus] Razorpay fetch failed:', e.message);
  }

  return {
    status: (await Refund.findById(refund._id)).status,
    refund: await Refund.findById(refund._id).lean(),
    order: await Order.findById(order._id).lean()
  };
}
