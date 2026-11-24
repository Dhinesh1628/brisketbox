import mongoose from 'mongoose';
import Razorpay from 'razorpay';
import { v4 as uuidv4 } from 'uuid';
import { Order } from '../models/Order.js';
import { Refund } from '../models/Refund.js';
import { PaymentEvent } from '../models/PaymentEvent.js';
import { creditWallet } from './walletService.js';

let razorpayClientInstance = null;

function getRazorpayClient() {
  if (razorpayClientInstance) return razorpayClientInstance;
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (key_id && key_secret) {
    try {
      razorpayClientInstance = new Razorpay({ key_id, key_secret });
      return razorpayClientInstance;
    } catch (e) {
      console.warn('[Razorpay] Client initialization failed:', e.message);
    }
  }
  return null;
}

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
 * Calls Razorpay for the exact unrefunded gateway amount.
 * Handles wallet and gateway portions separately.
 * Marks REFUNDED only after Razorpay confirms it.
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

  // 1. Check existing refund record for idempotency
  const existingRefund = await Refund.findOne({ idempotencyKey: derivedKey }).lean();
  if (existingRefund) {
    if (existingRefund.status === 'PROCESSED') {
      const refreshedOrder = await Order.findOne({
        $or: [{ id: cleanOrderId }, { orderNumber: cleanOrderId }]
      }).lean();
      return {
        success: true,
        message: 'Refund was already processed successfully',
        idempotent: true,
        refund: existingRefund,
        order: refreshedOrder
      };
    }
    if (existingRefund.status === 'PENDING') {
      const err = new Error('A refund for this order is currently in-flight. Please wait.');
      err.statusCode = 409;
      throw err;
    }
  }

  // 2. Fetch order
  const order = await Order.findOne({
    $or: [{ id: cleanOrderId }, { orderNumber: cleanOrderId }]
  });

  if (!order) {
    const err = new Error(`Order "${cleanOrderId}" not found`);
    err.statusCode = 404;
    throw err;
  }

  // Check if already refunded
  if (order.paymentStatus === 'REFUNDED') {
    return {
      success: true,
      message: 'Order is already marked as REFUNDED',
      idempotent: true,
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

  // 3. Handle Wallet portion separately
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

  // 4. Calculate exact unrefunded Gateway portion
  const totalAmount = Number(order.totalAmount || order.total || 0);
  const gatewayAmount = Math.max(0, totalAmount - walletDeduction);

  // If order was 100% wallet paid, no gateway call is needed!
  if (gatewayAmount === 0) {
    order.paymentStatus = 'REFUNDED';
    order.orderStatus = 'REFUNDED';
    order.lifecycleStatus = 'REFUNDED';
    order.refundAmount = walletDeduction;
    order.status = 'Fully Refunded (Store Credit)';
    await order.save();

    return {
      success: true,
      message: '100% wallet order refunded successfully to store credit',
      type: 'wallet_only',
      refundAmount: walletDeduction,
      order: order.toObject()
    };
  }

  // 5. Gateway Refund Call
  const paymentId = order.razorpayPaymentId;
  if (!paymentId) {
    const err = new Error(`Cannot process gateway refund: No Razorpay payment ID found on order ${cleanOrderId}`);
    err.statusCode = 400;
    throw err;
  }

  // Create PENDING Refund record
  const refundIdStr = `rfnd_rec_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
  let refundRecord = await Refund.create({
    id: refundIdStr,
    orderId: order.orderNumber || order.id,
    paymentId,
    amount: gatewayAmount,
    currency: 'INR',
    status: 'PENDING',
    idempotencyKey: derivedKey,
    reason
  });

  // Execute Gateway Call
  let rzpResponse;
  try {
    if (customRazorpayClient) {
      rzpResponse = await customRazorpayClient.payments.refund(paymentId, {
        amount: Math.round(gatewayAmount * 100),
        receipt: derivedKey,
        notes: { orderId: order.orderNumber || order.id, reason }
      });
    } else if (typeof globalThis.__mockRazorpayRefund === 'function') {
      rzpResponse = await globalThis.__mockRazorpayRefund(paymentId, gatewayAmount, derivedKey);
    } else if (process.env.NODE_ENV === 'test' || process.env.MOCK_RAZORPAY_REFUND) {
      // Mock Razorpay refunds locally in test environment
      if (process.env.MOCK_RAZORPAY_REFUND === 'fail' || reason?.includes('[simulate_fail]')) {
        throw new Error('Simulated Razorpay gateway failure');
      }
      rzpResponse = {
        id: `rfnd_mock_${Date.now()}`,
        entity: 'refund',
        amount: Math.round(gatewayAmount * 100),
        currency: 'INR',
        payment_id: paymentId,
        status: 'processed',
        receipt: derivedKey,
        created_at: Math.floor(Date.now() / 1000)
      };
    } else {
      const client = getRazorpayClient();
      if (!client) {
        throw new Error('Razorpay client not configured (missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET)');
      }
      rzpResponse = await client.payments.refund(paymentId, {
        amount: Math.round(gatewayAmount * 100),
        receipt: derivedKey,
        notes: { orderId: order.orderNumber || order.id, reason }
      });
    }
  } catch (gatewayErr) {
    // Gateway FAILED: Record failure, DO NOT mark order as REFUNDED!
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

    const err = new Error(`Razorpay refund failed: ${gatewayErr.message}`);
    err.statusCode = 502;
    throw err;
  }

  // 6. Gateway Confirmed: Mark PROCESSED
  const gatewayRefundId = rzpResponse?.id || `rfnd_${Date.now()}`;
  await Refund.updateOne(
    { _id: refundRecord._id },
    {
      $set: {
        status: 'PROCESSED',
        refundId: gatewayRefundId,
        gatewayResponse: rzpResponse,
        processedAt: new Date().toISOString()
      }
    }
  );

  // Atomically update Order
  order.paymentStatus = 'REFUNDED';
  order.orderStatus = 'REFUNDED';
  order.lifecycleStatus = 'REFUNDED';
  order.refundId = gatewayRefundId;
  order.refundAmount = totalAmount;
  order.status = 'Refunded via Razorpay';
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
    refundId: gatewayRefundId,
    refundRecord: await Refund.findById(refundRecord._id).lean(),
    order: order.toObject()
  };
}
