import express from 'express';
import crypto from 'crypto';
import Razorpay from 'razorpay';
import mongoose from 'mongoose';
import { db } from '../db.js';
import { User, normalizePhone } from '../models/User.js';
import { Order } from '../models/Order.js';
import { Cooler } from '../models/Cooler.js';
import { Refund } from '../models/Refund.js';
import { authenticate, authenticateOptional, requireAdmin, getAuthTokenFromReq, verifyToken } from '../services/auth.js';
import { calculateOrderPricing } from '../services/pricingService.js';
import { recordCouponUsage } from '../services/couponService.js';
import { debitWallet, creditWallet } from '../services/walletService.js';
import { deductStock, releaseStock } from '../services/stockService.js';
import { finalizePayment, releasePaymentReservations } from '../services/paymentFinalizer.js';
import { reserveDeliverySlot, releaseDeliverySlot, getAvailableDeliverySlots } from '../services/deliverySlotService.js';

const router = express.Router();

const getUserFromReq = async (req) => {
  const token = getAuthTokenFromReq(req);
  if (!token) return null;
  try {
    const decoded = verifyToken(token);
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      return await User.findOne({ id: decoded.id }).lean();
    }
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
    const reqAuthUser = (await getUserFromReq(req)) || req.user;
    const isGuest = !reqAuthUser;

    const guestId = `guest_${crypto.randomBytes(4).toString('hex')}`;
    const user = reqAuthUser || { 
      id: guestId, 
      name: addressDetails?.fullName || 'Valued Customer', 
      email: addressDetails?.email || 'customer@brisketbox.in', 
      phone: addressDetails?.phone ? normalizePhone(addressDetails.phone) : '',
      walletBalance: 0
    };

    // Guests are not allowed to place Cash on Delivery orders (prevents anonymous inventory tying)
    if (paymentMethod === 'cod' && isGuest) {
      return res.status(401).json({ error: 'Please sign in to place a Cash on Delivery order' });
    }

    // Guests are not allowed to use wallet store credit
    if (useWallet && isGuest) {
      return res.status(400).json({ error: 'Please sign in to use BrisketBox Wallet balance' });
    }

    // 1. CRITICAL: Tested Server-Side Pricing Function (Ignores all client discounts/prices)
    let pricing;
    try {
      pricing = await calculateOrderPricing({
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

    const isCod = paymentMethod === 'cod';
    // Cryptographically secure, collision-safe order number, PIN, and guestToken
    const orderNumber = `BB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const deliveryPin = crypto.randomInt(1000, 10000).toString();
    const guestToken = isGuest ? crypto.randomBytes(24).toString('hex') : null;

    // Real Delivery Slot: Atomic reservation & validation based on India time (Asia/Kolkata)
    let reservedSlot = null;
    const requestedSlotId = (req.body.deliverySlotId || deliverySlot || '').trim();

    try {
      if (requestedSlotId) {
        const slotRes = await reserveDeliverySlot({
          slotId: requestedSlotId,
          orderId: orderNumber,
          orderNumber,
          userId: user.id,
          isCod
        });
        reservedSlot = slotRes.slot;
      } else {
        const { nextAvailableSlot } = await getAvailableDeliverySlots();
        if (!nextAvailableSlot) {
          return res.status(400).json({ error: 'No delivery slots are currently available. Please select another slot.' });
        }
        const slotRes = await reserveDeliverySlot({
          slotId: nextAvailableSlot.id,
          orderId: orderNumber,
          orderNumber,
          userId: user.id,
          isCod
        });
        reservedSlot = slotRes.slot;
      }
    } catch (slotErr) {
      return res.status(400).json({ error: slotErr.message });
    }

    const assignedDeliverySlot = reservedSlot ? reservedSlot.label : (deliverySlot || 'Today, Express Delivery');
    const assignedDeliverySlotId = reservedSlot ? reservedSlot.id : null;
    const assignedHoldExpiresAt = reservedSlot ? reservedSlot.holdExpiresAt : null;

    // Upfront Wallet Balance Check & Debit (Prevents simultaneous multi-tab double spending)
    if (walletDeduction > 0) {
      if (isGuest) {
        if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
        return res.status(400).json({ error: 'Please sign in to use BrisketBox Wallet balance' });
      }
      let availableBalance = 0;
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        const dbUser = await User.findOne({ id: user.id }).lean();
        availableBalance = Number(dbUser?.walletBalance || 0);
      } else {
        const dbUser = db.findById('users', user.id);
        availableBalance = Number(dbUser?.walletBalance || 0);
      }

      if (availableBalance < walletDeduction) {
        if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
        return res.status(400).json({ 
          error: `Insufficient wallet balance. Available: ₹${availableBalance}, requested: ₹${walletDeduction}` 
        });
      }
    }

    // 2. CASE A: 100% Wallet Paid (Fully paid via store credit)
    if (walletDeduction > 0 && netPayable === 0) {
      // Debit wallet with idempotency key first
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
        if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
        return res.status(400).json({ error: walletErr.message });
      }

      // Deduct stock atomically
      try {
        await deductStock(processedItems);
      } catch (stockErr) {
        if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
        // Rollback debited wallet if stock fails
        await creditWallet({
          userId: user.id,
          amount: walletDeduction,
          idempotencyKey: `wallet_rollback_stock_${orderNumber}`,
          orderId: orderNumber,
          title: 'Wallet Rollback',
          description: 'Stock deduction failed; store credit refunded.'
        });
        return res.status(400).json({ error: stockErr.message });
      }

      if (couponCode) {
        await recordCouponUsage(couponCode, user, orderNumber);
      }

      const assignedRider = await assignFleetRiderForOrder();
      const order = await createOrderRecord({
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
        deliverySlotId: assignedDeliverySlotId,
        deliverySlot: assignedDeliverySlot,
        holdExpiresAt: assignedHoldExpiresAt,
        deliveryNotes,
        city: city || 'Bengaluru',
        paymentMethod: 'BrisketBox Wallet (Fully Paid)',
        paymentStatus: 'PAID',
        orderStatus: 'CONFIRMED',
        stockDeducted: true,
        walletDebited: true,
        assignedRider,
        guestToken
      });

      return res.status(201).json({
        success: true,
        isWalletPaid: true,
        order,
        guestToken,
        message: `Order placed successfully! ₹${walletDeduction} deducted from your BrisketBox Wallet.`
      });
    }

    // 3. CASE B: Cash on Delivery (COD)
    if (paymentMethod === 'cod') {
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
          if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
          return res.status(400).json({ error: walletErr.message });
        }
      }

      // Deduct stock atomically
      try {
        await deductStock(processedItems);
      } catch (stockErr) {
        if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
        if (walletDeduction > 0) {
          await creditWallet({
            userId: user.id,
            amount: walletDeduction,
            idempotencyKey: `wallet_rollback_stock_${orderNumber}`,
            orderId: orderNumber,
            title: 'Wallet Rollback',
            description: 'Stock deduction failed; store credit refunded.'
          });
        }
        return res.status(400).json({ error: stockErr.message });
      }

      if (couponCode) {
        await recordCouponUsage(couponCode, user, orderNumber);
      }

      const assignedRider = await assignFleetRiderForOrder();
      const order = await createOrderRecord({
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
        deliverySlotId: assignedDeliverySlotId,
        deliverySlot: assignedDeliverySlot,
        holdExpiresAt: assignedHoldExpiresAt,
        deliveryNotes,
        city: city || 'Bengaluru',
        paymentMethod: 'Cash on Delivery (Pay at Doorstep)',
        paymentStatus: 'PENDING',
        orderStatus: 'CONFIRMED',
        stockDeducted: true,
        walletDebited: walletDeduction > 0,
        assignedRider,
        guestToken
      });

      return res.status(201).json({
        success: true,
        isCod: true,
        order,
        guestToken,
        message: 'Order confirmed! Please have ₹' + netPayable + ' cash or UPI ready for delivery executive.'
      });
    }

    // 4. CASE C: Online Payment Gateway (Razorpay)
    // Upfront partial wallet deduction if customer combined wallet + online payment
    if (walletDeduction > 0) {
      const walletIdempotencyKey = `wallet_order_${orderNumber}_partial_reserve`;
      try {
        await debitWallet({
          userId: user.id,
          amount: walletDeduction,
          idempotencyKey: walletIdempotencyKey,
          orderId: orderNumber,
          title: `Partial Store Credit for Order #${orderNumber}`,
          description: `₹${walletDeduction} reserved for order payment.`
        });
      } catch (walletErr) {
        if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
        return res.status(400).json({ error: walletErr.message });
      }
    }

    let razorpayOrderId = `order_${crypto.randomBytes(8).toString('hex')}`;

    if (razorpayInstance && !isDemoKey) {
      try {
        const options = {
          amount: amountInPaise,
          currency: 'INR',
          receipt: orderNumber,
          payment_capture: 1,
          notes: {
            orderNumber,
            userId: user.id,
            city: city || 'Bengaluru'
          }
        };
        const rzpOrder = await razorpayInstance.orders.create(options);
        razorpayOrderId = rzpOrder.id;
      } catch (rzpErr) {
        console.error('[Razorpay Order Creation Failed]:', rzpErr);
        if (reservedSlot?.id) await releaseDeliverySlot({ slotId: reservedSlot.id, orderId: orderNumber, isConfirmed: isCod });
        if (walletDeduction > 0) {
          await creditWallet({
            userId: user.id,
            amount: walletDeduction,
            idempotencyKey: `wallet_release_rzp_fail_${orderNumber}`,
            orderId: orderNumber,
            title: 'Store Credit Release',
            description: 'Razorpay order creation failed; store credit released.'
          });
        }
        const gatewayMessage = rzpErr?.error?.description || rzpErr?.error?.message || rzpErr?.message || '';
        return res.status(502).json({ 
          error: 'Failed to initialize payment gateway. Please try again.',
          ...(gatewayMessage ? { details: gatewayMessage } : {})
        });
      }
    }

    const order = await createOrderRecord({
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
      deliverySlotId: assignedDeliverySlotId,
      deliverySlot: assignedDeliverySlot,
      holdExpiresAt: assignedHoldExpiresAt,
      deliveryNotes,
      city: city || 'Bengaluru',
      paymentMethod: walletDeduction > 0 ? `Wallet (₹${walletDeduction}) + Razorpay (₹${netPayable})` : 'razorpay',
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING_PAYMENT',
      stockDeducted: false,
      walletDebited: walletDeduction > 0,
      razorpayOrderId,
      amountInPaise,
      assignedRider: null,
      guestToken
    });

    res.status(200).json({
      success: true,
      orderId: order.id,
      orderNumber: order.orderNumber,
      guestToken,
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
    if (typeof reservedSlot !== 'undefined' && reservedSlot?.id) {
      await releaseDeliverySlot({
        slotId: reservedSlot.id,
        orderId: typeof orderNumber !== 'undefined' ? orderNumber : null,
        isConfirmed: typeof isCod !== 'undefined' ? isCod : false
      }).catch(() => {});
    }
    console.error('[Payments] Create order error:', err);
    res.status(500).json({ error: err.message || 'Internal payment error' });
  }
});

// ==========================================
// 2. POST /api/payments/verify
// ==========================================
router.post('/verify', authenticateOptional, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature, 
      orderId 
    } = req.body;

    const razorpayOrderId = req.body.razorpayOrderId || razorpay_order_id;
    const razorpayPaymentId = req.body.razorpayPaymentId || razorpay_payment_id;
    const razorpaySignature = req.body.razorpaySignature || razorpay_signature;

    if (!razorpayOrderId || !razorpayPaymentId) {
      return res.status(400).json({ error: 'Missing payment verification parameters (razorpay_order_id and razorpay_payment_id are required)' });
    }

    const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

    // Find order by Razorpay Order ID or internal Order ID from MongoDB
    let order = null;
    if (isMongo) {
      order = await Order.findOne({
        $or: [
          { razorpayOrderId: razorpay_order_id },
          { id: orderId },
          { orderNumber: orderId }
        ]
      }).lean();
    } else {
      order = (db.get('orders') || []).find(o => o.razorpayOrderId === razorpay_order_id || o.id === orderId || o.orderNumber === orderId);
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found for verification' });
    }

    // Access control: only the owning customer, admin, or guest with valid guestToken can verify
    const guestToken = req.headers['x-guest-token'] || req.body.guestToken;
    const isOwner = req.user && req.user.id === order.userId;
    const isAdmin = req.user && req.user.role === 'admin';
    const isValidGuest = guestToken && order.guestToken && guestToken === order.guestToken;

    if (!req.user && !isValidGuest) {
      return res.status(401).json({ error: 'Authentication or valid guest token required to verify payment' });
    }

    if (!isAdmin && !isOwner && !isValidGuest) {
      return res.status(403).json({ error: 'Access denied: You are not authorized to verify payment for this order' });
    }

    // Idempotency: If order is already PAID, return success immediately
    if (order.paymentStatus === 'PAID') {
      const sanitized = { ...order };
      if (req.user && req.user.role !== 'admin' && sanitized.userId !== req.user?.id && !isValidGuest) {
        delete sanitized.deliveryPin;
      }
      return res.status(200).json({
        success: true,
        message: 'Order payment already verified and processed',
        order: sanitized
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

          const expectedPaise = order.amountInPaise || Math.round((order.totalAmount || order.total) * 100);
          if (paymentDetails.amount !== expectedPaise) {
            return res.status(400).json({ 
              error: `Payment amount mismatch: Expected ₹${expectedPaise / 100}, got ₹${paymentDetails.amount / 100}` 
            });
          }

          if (paymentDetails.order_id !== order.razorpayOrderId) {
            return res.status(400).json({ error: 'Razorpay order ID mismatch' });
          }
        } catch (fetchErr) {
          console.error('[Razorpay Payment Fetch Failed]:', fetchErr);
          return res.status(400).json({ error: `Failed to verify payment with Razorpay: ${fetchErr.message}` });
        }
      }
    }

    if (!isSignatureValid) {
      console.warn('[Payments] Invalid payment signature detected for order:', razorpay_order_id);
      return res.status(400).json({ error: 'Invalid payment signature. Verification failed.' });
    }

    // Call unified, idempotent payment finalizer with real transactions
    const finalResult = await finalizePayment({
      orderId: order.id,
      razorpayPaymentId,
      razorpayOrderId,
      razorpaySignature,
      amountInPaise: order.amountInPaise || Math.round((order.totalAmount || order.total) * 100),
      currency: 'INR',
      source: 'verify',
      eventId: razorpayPaymentId
    });

    if (!finalResult.success && finalResult.refundRequired) {
      return res.status(400).json({
        error: finalResult.error,
        refundRequired: true,
        order: finalResult.order
      });
    }

    const updatedOrder = finalResult.order;
    const sanitizedOrder = { ...updatedOrder };
    if (req.user && req.user.role !== 'admin' && sanitizedOrder.userId !== req.user?.id && !isValidGuest) {
      delete sanitizedOrder.deliveryPin;
    }

    return res.status(200).json({
      success: true,
      message: 'Payment verified and order confirmed successfully',
      order: sanitizedOrder
    });
  } catch (err) {
    console.error('[Payments] Payment verification error:', err);
    res.status(500).json({ error: err.message || 'Payment verification failed' });
  }
});

// ==========================================
// 3. POST /api/payments/webhook
// ==========================================
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing x-razorpay-signature header' });
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
      return res.status(400).json({ error: 'Raw body required for webhook signature verification' });
    }

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
    const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

    console.log(`[Razorpay Webhook] Verified event: ${event}`);

    // Handle duplicate webhook events idempotently with transactions
    if (event === 'payment.captured') {
      const payment = payload.payment.entity;
      const orderId = payment.order_id;
      const noteOrderId = payment.notes?.orderId || payment.notes?.orderNumber;

      let order = null;
      if (isMongo) {
        const query = [{ razorpayOrderId: orderId }];
        if (noteOrderId) {
          query.push({ id: noteOrderId }, { orderNumber: noteOrderId });
        }
        order = await Order.findOne({ $or: query }).lean();
      } else {
        order = (db.get('orders') || []).find(o => 
          o.razorpayOrderId === orderId || (noteOrderId && (o.id === noteOrderId || o.orderNumber === noteOrderId))
        );
      }

      if (!order) {
        return res.status(404).json({ error: 'Order not found for captured payment' });
      }

      // Idempotency: If already marked PAID or REFUND_REQUIRED, acknowledge duplicate webhook safely
      if (order.paymentStatus === 'PAID') {
        return res.status(200).json({ status: 'ok', received: true, alreadyPaid: true });
      }
      if (order.orderStatus === 'REFUND_REQUIRED' || order.paymentStatus === 'REFUND_REQUIRED') {
        return res.status(200).json({ status: 'ok', received: true, refundRequired: true });
      }

      // 1. Verify currency
      if (payment.currency !== 'INR') {
        if (isMongo) {
          await Order.updateOne({ id: order.id }, { $set: { paymentStatus: 'FAILED' } });
        } else {
          db.update('orders', order.id, { paymentStatus: 'FAILED' });
        }
        return res.status(400).json({ error: `Currency mismatch: Expected INR, got ${payment.currency}` });
      }

      // 2. Verify amount
      const expectedPaise = order.amountInPaise || Math.round((order.totalAmount || order.total) * 100);
      if (payment.amount !== expectedPaise) {
        if (isMongo) {
          await Order.updateOne({ id: order.id }, { $set: { paymentStatus: 'FAILED' } });
        } else {
          db.update('orders', order.id, { paymentStatus: 'FAILED' });
        }
        return res.status(400).json({ error: `Payment amount mismatch: Expected ${expectedPaise} paise, got ${payment.amount} paise` });
      }

      // Unique PaymentEvent key: Razorpay payment ID or event ID, NEVER Date.now()!
      const uniqueEventId = req.body.id || req.headers['x-razorpay-event-id'] || payment.id;

      const finalResult = await finalizePayment({
        orderId: order.id,
        razorpayPaymentId: payment.id,
        razorpayOrderId: payment.order_id,
        amountInPaise: payment.amount,
        currency: payment.currency,
        source: 'webhook',
        eventId: uniqueEventId
      });

      return res.status(200).json({ status: 'ok', received: true, success: finalResult.success });
    } else if (event === 'payment.failed' || event === 'order.expired') {
      const payment = payload?.payment?.entity;
      const orderId = payment?.order_id || payload?.order?.entity?.id;

      let order = null;
      if (isMongo) {
        order = await Order.findOne({
          $or: [{ razorpayOrderId: orderId }, { id: orderId }]
        }).lean();
      } else {
        order = (db.get('orders') || []).find(o => o.razorpayOrderId === orderId || o.id === orderId);
      }

      if (order) {
        await releasePaymentReservations({ orderId: order.id });
        console.log(`[Webhook] Order ${order.id} payment failed/expired. Released reservations.`);
      }

      return res.status(200).json({ status: 'ok', received: true });
    } else if (event === 'refund.processed') {
      const refundEntity = payload?.refund?.entity || {};
      const paymentId = refundEntity.payment_id;
      const refundId = refundEntity.id;
      const receipt = refundEntity.receipt;
      const refundAmount = refundEntity.amount ? refundEntity.amount / 100 : 0;
      const noteOrderId = refundEntity.notes?.orderId || refundEntity.notes?.orderNumber;

      if (isMongo) {
        // 1. Update persisted Refund record to PROCESSED
        await Refund.updateOne(
          {
            $or: [
              { refundId },
              ...(receipt ? [{ idempotencyKey: receipt }] : []),
              ...(paymentId ? [{ paymentId }] : [])
            ]
          },
          {
            $set: {
              status: 'PROCESSED',
              refundId,
              gatewayResponse: refundEntity,
              processedAt: new Date().toISOString(),
              error: null
            }
          }
        );

        // 2. Mark order as REFUNDED
        const query = [];
        if (paymentId) query.push({ razorpayPaymentId: paymentId });
        if (refundId) query.push({ refundId });
        if (noteOrderId) query.push({ id: noteOrderId }, { orderNumber: noteOrderId });

        if (query.length > 0) {
          const order = await Order.findOne({ $or: query });
          if (order && order.paymentStatus !== 'REFUNDED') {
            order.paymentStatus = 'REFUNDED';
            order.orderStatus = 'REFUNDED';
            order.lifecycleStatus = 'REFUNDED';
            order.refundId = refundId || order.refundId;
            order.refundAmount = refundAmount || order.totalAmount || order.total;
            order.status = 'Refunded via Razorpay';
            order.refundProcessedAt = new Date().toISOString();
            await order.save();
          }
        }
      } else {
        const order = (db.get('orders') || []).find(o => 
          o.razorpayPaymentId === paymentId || (noteOrderId && (o.id === noteOrderId || o.orderNumber === noteOrderId))
        );
        if (order && order.paymentStatus !== 'REFUNDED') {
          db.update('orders', order.id, {
            paymentStatus: 'REFUNDED',
            orderStatus: 'REFUNDED',
            lifecycleStatus: 'REFUNDED',
            refundId: refundId || order.refundId,
            refundAmount: refundAmount || order.totalAmount || order.total,
            status: 'Refunded via Razorpay',
            refundProcessedAt: new Date().toISOString()
          });
        }
      }
      return res.status(200).json({ status: 'ok', received: true });
    } else if (event === 'refund.failed') {
      const refundEntity = payload?.refund?.entity || {};
      const paymentId = refundEntity.payment_id;
      const refundId = refundEntity.id;
      const receipt = refundEntity.receipt;
      const errorMsg = refundEntity.error_description || refundEntity.error?.description || 'Gateway refund failed';
      const noteOrderId = refundEntity.notes?.orderId || refundEntity.notes?.orderNumber;

      if (isMongo) {
        // Update Refund record to FAILED to allow retry
        await Refund.updateOne(
          {
            $or: [
              { refundId },
              ...(receipt ? [{ idempotencyKey: receipt }] : []),
              ...(paymentId ? [{ paymentId }] : [])
            ]
          },
          {
            $set: {
              status: 'FAILED',
              error: errorMsg,
              gatewayResponse: refundEntity
            }
          }
        );

        // Keep order in REFUND_REQUIRED so operations admin can retry
        const query = [];
        if (paymentId) query.push({ razorpayPaymentId: paymentId });
        if (refundId) query.push({ refundId });
        if (noteOrderId) query.push({ id: noteOrderId }, { orderNumber: noteOrderId });

        if (query.length > 0) {
          await Order.updateOne(
            { $or: query },
            {
              $set: {
                paymentStatus: 'REFUND_REQUIRED',
                orderStatus: 'REFUND_REQUIRED',
                status: 'Refund Failed at Gateway (Retry Required)'
              }
            }
          );
        }
      }
      return res.status(200).json({ status: 'ok', received: true });
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
router.get('/status/:orderId', authenticateOptional, async (req, res) => {
  const { orderId } = req.params;
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  let order = null;
  if (isMongo) {
    order = await Order.findOne({
      $or: [{ id: orderId }, { orderNumber: orderId }, { razorpayOrderId: orderId }]
    }).lean();
  } else {
    order = (db.get('orders') || []).find(o => o.id === orderId || o.orderNumber === orderId || o.razorpayOrderId === orderId);
  }

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const guestToken = req.headers['x-guest-token'] || req.query.guestToken;
  const isOwner = req.user && req.user.id === order.userId;
  const isAdmin = req.user && req.user.role === 'admin';
  const isValidGuest = guestToken && order.guestToken && guestToken === order.guestToken;

  if (!isAdmin && !isOwner && !isValidGuest) {
    return res.status(403).json({ error: 'Access denied: You are not authorized to view payment status for this order' });
  }

  res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    paymentMethod: order.paymentMethod,
    totalAmount: order.totalAmount,
    walletDeduction: order.walletDeduction || 0,
    coolerDeposit: order.coolerDeposit || 0,
    coolerId: order.coolerId,
    createdAt: order.createdAt
  });
});

// ==========================================
// 5. POST /api/payments/refund-coldbox
// ==========================================
router.post('/refund-coldbox', authenticate, requireAdmin, async (req, res) => {
  try {
    const { orderId, coolerId, notes } = req.body;
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
      return res.status(404).json({ error: 'Order not found' });
    }

    // Idempotency check: prevent duplicate refunds
    if (order.coldBoxRefundStatus === 'REFUNDED') {
      return res.status(400).json({ error: 'Cold-box deposit for this order has already been refunded' });
    }

    // A ₹0 deposit must produce a ₹0 refund!
    const depositPaid = Number(order.coolerDeposit || 0);
    if (depositPaid <= 0) {
      const refundUpdates = {
        coldBoxRefundStatus: 'REFUNDED',
        refundAmount: 0,
        refundProcessedAt: new Date().toISOString()
      };

      let updatedOrder = null;
      if (isMongo) {
        updatedOrder = await Order.findOneAndUpdate({ id: order.id }, { $set: refundUpdates }, { new: true }).lean();
      } else {
        updatedOrder = db.update('orders', order.id, refundUpdates);
      }

      return res.status(200).json({
        success: true,
        message: 'No deposit was charged for this order (₹0 deposit). Zero refund recorded.',
        refundAmount: 0,
        order: updatedOrder
      });
    }

    const actualTotalPaid = Number(order.totalAmount || order.total || 0);
    const refundAmount = Math.min(depositPaid, actualTotalPaid);

    let refundId = `rfnd_${crypto.randomBytes(6).toString('hex')}`;

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
        return res.status(502).json({ 
          error: `Razorpay refund failed: ${err.message}. Refund was not recorded.` 
        });
      }
    }

    const refundUpdates = {
      coldBoxRefundStatus: 'REFUNDED',
      refundId,
      refundAmount,
      refundProcessedAt: new Date().toISOString()
    };

    let updatedOrder = null;
    if (isMongo) {
      updatedOrder = await Order.findOneAndUpdate({ id: order.id }, { $set: refundUpdates }, { new: true }).lean();
      if (order.coolerId) {
        await Cooler.findOneAndUpdate(
          { id: order.coolerId },
          { $set: { status: 'available', currentOrderId: null, currentUserId: null } }
        );
      }
    } else {
      updatedOrder = db.update('orders', order.id, refundUpdates);
      if (order.coolerId) {
        db.update('coolers', order.coolerId, {
          status: 'available',
          currentOrderId: null,
          currentUserId: null
        });
      }
    }

    res.status(200).json({
      success: true,
      message: `Cold-box deposit of ₹${refundAmount} refunded successfully`,
      refundAmount,
      refundId,
      order: updatedOrder
    });
  } catch (err) {
    console.error('[Payments] Coldbox refund error:', err);
    res.status(500).json({ error: err.message || 'Failed to process cold-box refund' });
  }
});

// Helper functions for fleet assignment
async function assignFleetRiderForOrder() {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  let riders = [];
  if (isMongo) {
    riders = await User.find({ role: 'rider', approvalStatus: 'approved' }).lean();
  } else {
    riders = (db.get('users') || []).filter(u => u.role === 'rider' && u.approvalStatus === 'approved');
  }

  if (riders.length > 0) {
    const selected = riders[0];
    return {
      riderId: selected.id,
      riderName: selected.name ? selected.name.split(' ')[0] : 'Rider',
      riderFullName: selected.name || 'Fleet Delivery Executive',
      riderPhone: selected.phone || '',
      riderVehicle: selected.vehicleType ? `${selected.vehicleType} (${selected.vehicleNumber || 'KA-04-EV'})` : 'EV 2-Wheeler',
      deliveryExecutive: `${selected.name || 'Fleet Executive'}${selected.phone ? ` (${selected.phone})` : ''}`
    };
  }

  return {
    riderId: null,
    riderName: null,
    riderFullName: null,
    riderPhone: null,
    riderVehicle: null,
    deliveryExecutive: null
  };
}

async function createOrderRecord(params) {
  const {
    orderNumber,
    user,
    processedItems,
    subtotal,
    discount,
    couponCode,
    coolerDeposit,
    shippingFee,
    tipAmount,
    deliveryPin,
    totalAmount,
    walletDeduction,
    deliveryAddress,
    addressDetails,
    deliverySlotId = null,
    deliverySlot,
    holdExpiresAt = null,
    deliveryNotes,
    city,
    paymentMethod,
    paymentStatus,
    orderStatus,
    razorpayOrderId = '',
    amountInPaise = 0,
    assignedRider = null,
    stockDeducted = false,
    walletDebited = false,
    guestToken = null
  } = params;

  let assignedCooler = null;
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  if (orderStatus === 'CONFIRMED' || paymentMethod === 'cod') {
    if (isMongo) {
      const cooler = await Cooler.findOneAndUpdate(
        { status: 'available' },
        { 
          $set: { 
            status: 'assigned', 
            currentOrderId: orderNumber, 
            currentUserId: user.id, 
            currentUserName: user.name 
          } 
        },
        { new: true }
      );
      if (cooler) assignedCooler = { id: cooler.id, model: cooler.model };
    } else {
      const availableCoolers = db.get('coolers') || [];
      assignedCooler = availableCoolers.find(c => c.status === 'available') || null;
      if (assignedCooler) {
        db.update('coolers', assignedCooler.id, {
          status: 'assigned',
          currentOrderId: orderNumber,
          currentUserId: user.id,
          currentUserName: user.name
        });
      }
    }
  }

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const order = {
    id: orderNumber,
    orderNumber,
    guestToken,
    userId: user.id,
    customerName: user.name,
    customerEmail: user.email,
    customerPhone: user.phone ? normalizePhone(user.phone) : '',
    deliveryAddress,
    addressDetails,
    city: city || user.city || '',
    items: processedItems,
    subtotal,
    discountAmount: discount || 0,
    couponCode: couponCode || null,
    coolerDeposit: coolerDeposit || 0,
    shippingFee: shippingFee || 0,
    tipAmount: Number(tipAmount || 0),
    deliveryPin: deliveryPin || crypto.randomInt(1000, 10000).toString(),
    walletDeduction: Number(walletDeduction || 0),
    stockDeducted: Boolean(stockDeducted),
    walletDebited: Boolean(walletDebited),
    total: totalAmount,
    totalAmount,
    amountInPaise,
    status: orderStatus === 'CONFIRMED' ? 'Order Confirmed' : 'Pending Payment',
    orderStatus: orderStatus || 'PENDING_PAYMENT',
    lifecycleStatus: orderStatus || 'PENDING_PAYMENT',
    partnerId: null,
    partnerName: null,
    paymentMethod,
    paymentStatus: paymentStatus || 'PENDING',
    razorpayOrderId,
    razorpayPaymentId: '',
    razorpaySignature: '',
    coolerId: assignedCooler?.id || null,
    coolerModel: assignedCooler?.model || null,
    coldBoxRefundStatus: 'NOT_REQUESTED',
    liveTemp: null,
    riderId: assignedRider?.riderId || null,
    riderFullName: assignedRider?.riderFullName || null,
    riderName: assignedRider?.riderName || null,
    riderPhone: assignedRider?.riderPhone || null,
    riderVehicle: assignedRider?.riderVehicle || null,
    deliveryExecutive: assignedRider?.deliveryExecutive || null,
    tempLog: [],
    deliverySlotId: deliverySlotId || null,
    deliverySlot: deliverySlot || 'Scheduled Delivery',
    holdExpiresAt: holdExpiresAt || null,
    slotReleased: false,
    trackingCode: `BB-TRK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    pinAttempts: 0,
    pinLockedUntil: null,
    createdAt: new Date().toISOString(),
    deliveryNotes: deliveryNotes || ''
  };

  if (isMongo) {
    await Order.create(order);
  } else {
    db.insert('orders', order);
  }

  return order;
}

export default router;
