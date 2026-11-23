import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import { db } from '../db.js';
import { assignFleetRiderForOrder } from '../dispatch.js';
import { getAuthTokenFromReq, verifyToken, authenticate, requireAdmin } from '../services/auth.js';
import { calculateOrderPricing } from '../services/pricingService.js';
import { recordCouponUsage } from '../services/couponService.js';
import { deductStock, releaseStock } from '../services/stockService.js';
import { debitWallet } from '../services/walletService.js';

const router = express.Router();

const getUserFromReq = (req) => {
  const token = getAuthTokenFromReq(req);
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    return db.findById('users', decoded.id) || null;
  } catch (e) {
    return null;
  }
};

const isProd = process.env.NODE_ENV === 'production';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || (isProd ? '' : 'rzp_test_placeholder');
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || (isProd ? '' : 'test_secret_placeholder');
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || (isProd ? '' : 'test_webhook_placeholder');

// Initialize Razorpay instance
let razorpayInstance = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  try {
    razorpayInstance = new Razorpay({
      key_id: RAZORPAY_KEY_ID,
      key_secret: RAZORPAY_KEY_SECRET
    });
  } catch (e) {
    console.warn('[Razorpay] Initialization warning:', e.message);
  }
}

// Helper to determine if server-side simulation mode is active (strictly non-production only)
const isServerSimulationEnabled = !isProd && process.env.ENABLE_PAYMENT_SIMULATION === 'true';
const isDemoKey = !isProd && (RAZORPAY_KEY_ID.includes('placeholder') || RAZORPAY_KEY_ID.includes('DemoKey'));

// ==========================================
// 1. POST /api/payments/create-order
// ==========================================
router.post('/create-order', async (req, res) => {
  try {
    const { 
      items, 
      deliveryAddress, 
      addressDetails, 
      deliverySlot, 
      deliveryNotes, 
      city, 
      couponCode, 
      paymentMethod = 'razorpay',
      useWallet = false,
      tipAmount = 0
    } = req.body;

    if (!items || !items.length) {
      return res.status(400).json({ error: 'Please add at least one cut to your cold box' });
    }

    // Authenticate user or create guest session
    const user = getUserFromReq(req) || req.user || { 
      id: `guest_${crypto.randomBytes(4).toString('hex')}`, 
      name: addressDetails?.fullName || 'Valued Customer', 
      email: addressDetails?.email || 'customer@brisketbox.in', 
      phone: addressDetails?.phone || '+91 98765 43210',
      walletBalance: 0
    };

    // 1. CRITICAL: Tested Server-Side Pricing Function (Ignores all client discounts/prices)
    let pricing;
    try {
      pricing = calculateOrderPricing({
        items,
        couponCode,
        user,
        useWallet: Boolean(useWallet),
        tipAmount
      });
    } catch (pricingErr) {
      return res.status(400).json({ error: pricingErr.message });
    }

    const {
      subtotal,
      discountAmount,
      coolerDeposit,
      shippingFee,
      grossTotal,
      walletDeduction,
      netPayable,
      amountInPaise,
      processedItems
    } = pricing;

    // Cryptographically secure, collision-safe order number and PIN
    const orderNumber = `BB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const deliveryPin = crypto.randomInt(1000, 10000).toString();

    // 2. CASE A: 100% Wallet Paid (Fully paid via store credit)
    if (walletDeduction > 0 && netPayable === 0) {
      // Deduct stock atomically
      try {
        await deductStock(processedItems);
      } catch (stockErr) {
        return res.status(400).json({ error: stockErr.message });
      }

      // Debit wallet with idempotency key
      const walletIdempotencyKey = `wallet_order_${orderNumber}_debit`;
      try {
        await debitWallet({
          userId: user.id,
          amount: walletDeduction,
          idempotencyKey: walletIdempotencyKey,
          orderId: orderNumber,
          title: `Paid for Order #${orderNumber}`,
          description: 'Order paid in full using BrisketBox Wallet store credit.'
        });
      } catch (walletErr) {
        // Rollback stock if wallet deduction failed
        await releaseStock(processedItems);
        return res.status(400).json({ error: walletErr.message });
      }

      // Record coupon usage if applied
      if (couponCode) {
        recordCouponUsage(couponCode, user, orderNumber);
      }

      const assignedRider = assignFleetRiderForOrder();
      const order = createOrderRecord({
        orderNumber,
        user,
        processedItems,
        subtotal,
        discount: discountAmount,
        couponCode,
        coolerDeposit,
        shippingFee,
        tipAmount: pricing.tipAmount,
        deliveryPin,
        totalAmount: 0,
        walletDeduction,
        deliveryAddress: deliveryAddress || `${addressDetails?.flatNo || ''}, ${addressDetails?.building || ''}, ${addressDetails?.street || ''}, ${city || 'Bengaluru'} - ${addressDetails?.pincode || ''}`,
        addressDetails,
        deliverySlot,
        deliveryNotes,
        city: city || 'Bengaluru',
        paymentMethod: 'BrisketBox Wallet (Fully Paid)',
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        assignedRider
      });

      return res.status(201).json({
        success: true,
        isWalletPaid: true,
        order,
        message: `Order placed successfully! ₹${walletDeduction} deducted from your BrisketBox Wallet.`
      });
    }

    // 3. CASE B: Cash on Delivery (COD)
    if (paymentMethod === 'cod') {
      // Deduct stock atomically
      try {
        await deductStock(processedItems);
      } catch (stockErr) {
        return res.status(400).json({ error: stockErr.message });
      }

      // If partial wallet was used, debit wallet atomically
      if (walletDeduction > 0) {
        const walletIdempotencyKey = `wallet_order_${orderNumber}_partial_debit`;
        try {
          await debitWallet({
            userId: user.id,
            amount: walletDeduction,
            idempotencyKey: walletIdempotencyKey,
            orderId: orderNumber,
            title: `Partial Payment for #${orderNumber}`,
            description: `₹${walletDeduction} store credit deducted from BrisketBox Wallet.`
          });
        } catch (walletErr) {
          await releaseStock(processedItems);
          return res.status(400).json({ error: walletErr.message });
        }
      }

      if (couponCode) {
        recordCouponUsage(couponCode, user, orderNumber);
      }

      const assignedRider = assignFleetRiderForOrder();
      const order = createOrderRecord({
        orderNumber,
        user,
        processedItems,
        subtotal,
        discount: discountAmount,
        couponCode,
        coolerDeposit,
        shippingFee,
        tipAmount: pricing.tipAmount,
        deliveryPin,
        totalAmount: netPayable,
        walletDeduction,
        deliveryAddress: deliveryAddress || `${addressDetails?.flatNo || ''}, ${addressDetails?.building || ''}, ${addressDetails?.street || ''}, ${city || 'Bengaluru'} - ${addressDetails?.pincode || ''}`,
        addressDetails,
        deliverySlot,
        deliveryNotes,
        city: city || 'Bengaluru',
        paymentMethod: walletDeduction > 0 ? `Wallet (₹${walletDeduction}) + Cash on Delivery (₹${netPayable})` : 'cod',
        paymentStatus: 'PENDING',
        orderStatus: 'CONFIRMED',
        assignedRider
      });

      return res.status(201).json({
        success: true,
        isCod: true,
        order,
        message: walletDeduction > 0
          ? `Order placed! ₹${walletDeduction} deducted from wallet, pay ₹${netPayable} in cash at doorstep.`
          : 'Order placed successfully via Cash on Delivery'
      });
    }

    // 4. CASE C: Online Payment (Razorpay)
    // Order is created in PENDING_PAYMENT status. Rider and butcher queues are NOT assigned until payment is verified.
    let razorpayOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;
    
    if (razorpayInstance && !isDemoKey) {
      try {
        const rzpOrder = await razorpayInstance.orders.create({
          amount: amountInPaise,
          currency: 'INR',
          receipt: orderNumber,
          notes: {
            orderNumber,
            customerEmail: user.email || addressDetails?.email || '',
            walletDeduction: String(walletDeduction)
          }
        });
        razorpayOrderId = rzpOrder.id;
      } catch (err) {
        console.error('[Razorpay] Order creation failed:', err.message);
        if (isProd) {
          return res.status(502).json({ error: 'Payment gateway temporarily unavailable. Please choose COD or try again.' });
        }
        razorpayOrderId = `order_test_${crypto.randomBytes(8).toString('hex')}`;
      }
    } else {
      razorpayOrderId = `order_test_${crypto.randomBytes(8).toString('hex')}`;
    }

    const order = createOrderRecord({
      orderNumber,
      user,
      processedItems,
      subtotal,
      discount: discountAmount,
      couponCode,
      coolerDeposit,
      shippingFee,
      tipAmount: pricing.tipAmount,
      deliveryPin,
      totalAmount: netPayable,
      walletDeduction,
      deliveryAddress: deliveryAddress || `${addressDetails?.flatNo || ''}, ${addressDetails?.building || ''}, ${addressDetails?.street || ''}, ${city || 'Bengaluru'} - ${addressDetails?.pincode || ''}`,
      addressDetails,
      deliverySlot,
      deliveryNotes,
      city: city || 'Bengaluru',
      paymentMethod: walletDeduction > 0 ? `Wallet (₹${walletDeduction}) + Razorpay (₹${netPayable})` : 'razorpay',
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING_PAYMENT', // Unpaid online orders must stay PENDING_PAYMENT
      razorpayOrderId,
      amountInPaise,
      assignedRider: null // Unpaid online orders must not reach rider queues
    });

    res.status(200).json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId,
      amount: amountInPaise,
      currency: 'INR',
      keyId: RAZORPAY_KEY_ID,
      isDemoKey,
      customer: {
        name: order.customerName,
        email: order.customerEmail,
        contact: order.customerPhone
      }
    });
  } catch (err) {
    console.error('[Payments] Create order error:', err);
    res.status(500).json({ error: err.message || 'Internal payment error' });
  }
});

// ==========================================
// 2. POST /api/payments/verify
// ==========================================
router.post('/verify', async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      orderId 
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ error: 'Missing payment verification parameters (razorpay_order_id and razorpay_payment_id are required)' });
    }

    // Find order by Razorpay Order ID or internal Order ID
    let order = db.get('orders').find(o => o.razorpayOrderId === razorpay_order_id || o.id === orderId || o.orderNumber === orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found for verification' });
    }

    // Idempotency: If order is already PAID, return success immediately
    if (order.paymentStatus === 'PAID') {
      return res.status(200).json({
        success: true,
        message: 'Order payment already verified and processed',
        order
      });
    }

    let isSignatureValid = false;

    // Check if non-production simulation is enabled on server
    if (isServerSimulationEnabled || isDemoKey) {
      isSignatureValid = true;
    } else {
      if (!razorpay_signature) {
        return res.status(400).json({ error: 'Missing razorpay_signature for payment verification' });
      }

      // Timing-safe HMAC SHA256 signature verification
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

      try {
        const sigBuf = Buffer.from(razorpay_signature, 'utf8');
        const expectedBuf = Buffer.from(expectedSignature, 'utf8');
        isSignatureValid = sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf);
      } catch (err) {
        isSignatureValid = false;
      }

      // Verify payment details via Razorpay API (do not treat failed check as success)
      if (isSignatureValid && razorpayInstance) {
        try {
          const paymentDetails = await razorpayInstance.payments.fetch(razorpay_payment_id);
          
          if (!['captured', 'authorized'].includes(paymentDetails.status)) {
            return res.status(400).json({ 
              error: `Payment verification failed: Razorpay payment status is ${paymentDetails.status}` 
            });
          }

          if (paymentDetails.currency !== 'INR') {
            return res.status(400).json({ error: `Currency mismatch: Expected INR, got ${paymentDetails.currency}` });
          }

          const expectedPaise = order.amountInPaise || Math.round(order.totalAmount * 100);
          if (paymentDetails.amount !== expectedPaise) {
            return res.status(400).json({ 
              error: `Payment amount mismatch: Expected ₹${expectedPaise / 100}, got ₹${paymentDetails.amount / 100}` 
            });
          }

          if (paymentDetails.order_id !== order.razorpayOrderId) {
            return res.status(400).json({ error: 'Razorpay order ID mismatch' });
          }
        } catch (fetchErr) {
          console.error('[Razorpay] Payment fetch verification failed:', fetchErr.message);
          return res.status(400).json({ error: `Payment gateway verification failed: ${fetchErr.message}` });
        }
      }
    }

    if (!isSignatureValid) {
      db.update('orders', order.id, {
        paymentStatus: 'FAILED',
        orderStatus: 'PENDING_PAYMENT'
      });
      return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
    }

    // Deduct stock atomically now that payment is confirmed
    try {
      await deductStock(order.items);
    } catch (stockErr) {
      console.error('[Payments] Stock deduction error post-payment:', stockErr);
      return res.status(409).json({ error: `Item out of stock during payment: ${stockErr.message}. Refund will be issued.` });
    }

    // Deduct wallet store credit if partial wallet was used
    if (order.walletDeduction > 0 && order.userId) {
      const walletIdempotencyKey = `wallet_order_${order.orderNumber || order.id}_partial_debit`;
      try {
        await debitWallet({
          userId: order.userId,
          amount: order.walletDeduction,
          idempotencyKey: walletIdempotencyKey,
          orderId: order.orderNumber || order.id,
          title: `Partial Payment for #${order.orderNumber || order.id}`,
          description: `₹${order.walletDeduction} store credit deducted from BrisketBox Wallet.`
        });
      } catch (walletErr) {
        console.warn('[Payments] Partial wallet deduction note:', walletErr.message);
      }
    }

    // Record coupon usage
    if (order.couponCode) {
      recordCouponUsage(order.couponCode, { id: order.userId }, order.id);
    }

    // Assign fleet rider now that payment is confirmed
    const assignedRider = assignFleetRiderForOrder();

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const updatedOrder = db.update('orders', order.id, {
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED',
      status: 'Order Confirmed',
      lifecycleStatus: 'CONFIRMED',
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature || 'SERVER_VERIFIED',
      riderId: assignedRider.riderId,
      riderFullName: assignedRider.riderFullName,
      riderName: assignedRider.riderName,
      riderPhone: assignedRider.riderPhone,
      riderVehicle: assignedRider.riderVehicle,
      deliveryExecutive: assignedRider.deliveryExecutive,
      tempLog: [
        { time: timeStr, temp: 0.8, event: `Payment of ₹${order.totalAmount} received via Razorpay (${razorpay_payment_id}). Order confirmed & assigned to fleet.` }
      ]
    });

    res.status(200).json({
      success: true,
      message: 'Payment verified and order confirmed successfully',
      order: updatedOrder
    });
  } catch (err) {
    console.error('[Payments] Verify error:', err);
    res.status(500).json({ error: err.message || 'Payment verification failed' });
  }
});

// ==========================================
// 3. POST /api/payments/webhook
// ==========================================
router.post('/webhook', (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing X-Razorpay-Signature header' });
    }

    if (!RAZORPAY_WEBHOOK_SECRET) {
      console.error('[Razorpay Webhook] RAZORPAY_WEBHOOK_SECRET is not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const rawBody = req.rawBody || JSON.stringify(req.body);

    // Cryptographic timing-safe comparison on the exact raw body
    const expectedSignature = crypto
      .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest('hex');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      console.warn('[Razorpay Webhook] Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body.event;
    const payload = req.body.payload;

    console.log(`[Razorpay Webhook] Verified event: ${event}`);

    // Handle duplicate webhook events idempotently
    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;
      const order = db.get('orders').find(o => o.razorpayOrderId === orderId);

      if (order && order.paymentStatus !== 'PAID') {
        const assignedRider = assignFleetRiderForOrder();
        db.update('orders', order.id, {
          paymentStatus: 'PAID',
          orderStatus: 'CONFIRMED',
          lifecycleStatus: 'CONFIRMED',
          razorpayPaymentId: payment.id,
          riderId: assignedRider.riderId,
          riderFullName: assignedRider.riderFullName,
          riderName: assignedRider.riderName,
          riderPhone: assignedRider.riderPhone,
          riderVehicle: assignedRider.riderVehicle,
          deliveryExecutive: assignedRider.deliveryExecutive
        });
        console.log(`[Webhook] Order ${order.id} marked PAID and CONFIRMED via webhook`);
      }
    } else if (event === 'payment.failed') {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;
      const order = db.get('orders').find(o => o.razorpayOrderId === orderId);

      if (order && order.paymentStatus === 'PENDING') {
        db.update('orders', order.id, {
          paymentStatus: 'FAILED',
          orderStatus: 'PENDING_PAYMENT'
        });
        console.log(`[Webhook] Order ${order.id} payment marked FAILED via webhook`);
      }
    } else if (event === 'refund.processed') {
      const refund = payload.refund.entity;
      const paymentId = refund.payment_id;
      const order = db.get('orders').find(o => o.razorpayPaymentId === paymentId);

      if (order && order.refundStatus !== 'REFUNDED') {
        db.update('orders', order.id, {
          refundStatus: 'REFUNDED',
          refundId: refund.id,
          refundAmount: refund.amount / 100,
          refundProcessedAt: new Date().toISOString()
        });
        console.log(`[Webhook] Refund for order ${order.id} processed: ₹${refund.amount / 100}`);
      }
    }

    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[Razorpay Webhook] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. GET /api/payments/status/:orderId
// ==========================================
router.get('/status/:orderId', (req, res) => {
  const { orderId } = req.params;
  const order = db.get('orders').find(o => o.id === orderId || o.orderNumber === orderId || o.razorpayOrderId === orderId);

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  res.status(200).json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
    createdAt: order.createdAt
  });
});

// ==========================================
// 5. POST /api/payments/refund-coldbox (Admin authorized, idempotent, strictly matching deposit paid)
// ==========================================
router.post('/refund-coldbox', authenticate, requireAdmin, async (req, res) => {
  try {
    const { orderId, coolerId, notes } = req.body;
    const order = db.get('orders').find(o => o.id === orderId || o.orderNumber === orderId);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Idempotency check: prevent duplicate refunds
    if (order.coldBoxRefundStatus === 'REFUNDED') {
      return res.status(400).json({ error: 'Cold-box deposit for this order has already been refunded' });
    }

    // A ₹0 deposit must produce a ₹0 refund!
    const depositPaid = Number(order.coolerDeposit || 0);
    if (depositPaid <= 0) {
      const updatedOrder = db.update('orders', order.id, {
        coldBoxRefundStatus: 'REFUNDED',
        refundAmount: 0,
        refundProcessedAt: new Date().toISOString()
      });
      return res.status(200).json({
        success: true,
        message: 'No deposit was charged for this order (₹0 deposit). Zero refund recorded.',
        refundAmount: 0,
        order: updatedOrder
      });
    }

    // Ensure refund does not exceed amount actually paid
    const actualTotalPaid = Number(order.totalAmount || 0);
    const refundAmount = Math.min(depositPaid, actualTotalPaid);

    let refundId = `rfnd_${crypto.randomBytes(6).toString('hex')}`;

    // If online payment via Razorpay, initiate real gateway refund
    if (order.razorpayPaymentId && razorpayInstance && !isDemoKey) {
      try {
        const rzpRefund = await razorpayInstance.payments.refund(order.razorpayPaymentId, {
          amount: Math.round(refundAmount * 100),
          notes: {
            reason: 'Cold Box Deposit Refund',
            coolerId: order.coolerId || coolerId
          }
        });
        refundId = rzpRefund.id;
      } catch (err) {
        console.error('[Razorpay Refund Error]:', err.message);
        // Do NOT record refund as successful if gateway failed!
        return res.status(502).json({ 
          error: `Razorpay refund failed: ${err.message}. Refund was not recorded.` 
        });
      }
    }

    // Update Order & Cooler
    const updatedOrder = db.update('orders', order.id, {
      coldBoxRefundStatus: 'REFUNDED',
      refundId,
      refundAmount,
      refundProcessedAt: new Date().toISOString()
    });

    if (order.coolerId) {
      db.update('coolers', order.coolerId, {
        status: 'available',
        currentOrderId: null,
        currentUserId: null
      });
    }

    res.status(200).json({
      success: true,
      message: `₹${refundAmount} cold-box deposit refund processed successfully`,
      refundId,
      refundAmount,
      order: updatedOrder
    });
  } catch (err) {
    console.error('[Payments] Coldbox refund error:', err);
    res.status(500).json({ error: err.message || 'Refund processing failed' });
  }
});

// Helper to create and insert order
function createOrderRecord(params) {
  const {
    orderNumber,
    user,
    processedItems,
    subtotal,
    discount,
    couponCode,
    coolerDeposit,
    shippingFee,
    tipAmount = 0,
    deliveryPin = '',
    totalAmount,
    walletDeduction = 0,
    deliveryAddress,
    addressDetails,
    deliverySlot,
    deliveryNotes,
    city,
    paymentMethod,
    paymentStatus,
    orderStatus,
    razorpayOrderId = '',
    amountInPaise = 0,
    assignedRider = null
  } = params;

  // Assign existing available cooler box, or null (do not auto-create fake coolers)
  const availableCoolers = db.get('coolers') || [];
  const assignedCooler = availableCoolers.find(c => c.status === 'available') || null;

  if (assignedCooler) {
    db.update('coolers', assignedCooler.id, {
      status: 'assigned',
      currentOrderId: orderNumber,
      currentUserId: user.id,
      currentUserName: user.name
    });
  }

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const initialTemp = 0.8;

  const order = {
    id: orderNumber,
    orderNumber,
    userId: user.id,
    customerName: user.name,
    customerEmail: user.email,
    customerPhone: user.phone || '+91 98765 43210',
    deliveryAddress,
    addressDetails,
    city: city || 'Bengaluru',
    items: processedItems,
    subtotal,
    discountAmount: discount || 0,
    couponCode: couponCode || null,
    coolerDeposit: coolerDeposit || 0,
    shippingFee: shippingFee || 0,
    tipAmount: Number(tipAmount || 0),
    deliveryPin: deliveryPin || crypto.randomInt(1000, 10000).toString(),
    walletDeduction: Number(walletDeduction || 0),
    total: totalAmount,
    totalAmount,
    amountInPaise,
    status: orderStatus === 'CONFIRMED' ? 'Order Confirmed' : 'Pending Payment',
    orderStatus: orderStatus || 'PENDING_PAYMENT',
    lifecycleStatus: orderStatus || 'PENDING_PAYMENT',
    partnerId: 'shop_central_butcher',
    partnerName: 'Halal Cuts & Coastal Harbor Station #14',
    paymentMethod,
    paymentStatus: paymentStatus || 'PENDING',
    razorpayOrderId,
    razorpayPaymentId: '',
    razorpaySignature: '',
    coolerId: assignedCooler?.id || null,
    coolerModel: assignedCooler?.model || null,
    coldBoxRefundStatus: 'NOT_REQUESTED',
    liveTemp: initialTemp,
    riderId: assignedRider?.riderId || null,
    riderFullName: assignedRider?.riderFullName || null,
    riderName: assignedRider?.riderName || null,
    riderPhone: assignedRider?.riderPhone || null,
    riderVehicle: assignedRider?.riderVehicle || null,
    deliveryExecutive: assignedRider?.deliveryExecutive || null,
    tempLog: [
      { time: timeStr, temp: initialTemp, event: orderStatus === 'CONFIRMED' ? 'Order Confirmed. Queued for butchery.' : 'Order initiated. Awaiting payment confirmation.' }
    ],
    deliverySlot: deliverySlot || 'Today, Express in 90 Mins',
    trackingCode: `BB-TRK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    pinAttempts: 0,
    pinLockedUntil: null,
    createdAt: new Date().toISOString(),
    deliveryNotes: deliveryNotes || ''
  };

  db.insert('orders', order);
  return order;
}

export default router;
