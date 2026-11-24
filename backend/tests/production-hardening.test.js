import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import crypto from 'crypto';
import fs from 'fs';
import jwt from 'jsonwebtoken';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_audit_hardening_key_32bytes_long!';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_key_12345';
process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder';
process.env.RAZORPAY_KEY_SECRET = 'test_secret_placeholder';

const localBinaryPath = 'C:\\Users\\dines\\.cache\\mongodb-binaries\\mongod-x64-win32-5.0.19.exe';
const systemBinary = process.env.MONGOMS_SYSTEM_BINARY || (fs.existsSync(localBinaryPath) ? localBinaryPath : undefined);
const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  binary: systemBinary ? { systemBinary } : {}
});
const mongoUri = replSet.getUri();
process.env.MONGODB_URI = mongoUri;

const { default: app } = await import('../server.js');
const { connectMongoDB } = await import('../mongo.js');
const { db } = await import('../db.js');
const { User } = await import('../models/User.js');
const { Product } = await import('../models/Product.js');
const { Order } = await import('../models/Order.js');
const { Cooler } = await import('../models/Cooler.js');
const { WalletLedger } = await import('../models/WalletLedger.js');
const { CouponUsage } = await import('../models/CouponUsage.js');
const { PaymentEvent } = await import('../models/PaymentEvent.js');
const { deductStock, releaseStock } = await import('../services/stockService.js');
const { debitWallet, creditWallet } = await import('../services/walletService.js');
const { finalizePayment, releasePaymentReservations } = await import('../services/paymentFinalizer.js');
const { cancelOrder } = await import('../services/orderService.js');

function createToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('Enterprise Production Hardening & Security Test Suite', () => {
  let customer1, customer2, riderApproved, riderUnapproved, partnerApproved, adminUser;
  let customer1Token, customer2Token, riderApprovedToken, riderUnapprovedToken, partnerToken, adminToken;

  before(async () => {
    // 1. Ensure live connection to in-memory MongoDB
    await connectMongoDB();
    while (mongoose.connection.readyState !== 1) {
      await new Promise(r => setTimeout(r, 50));
    }

    // 2. Seed initial test users and products in MongoDB
    customer1 = {
      id: 'cust_ph_1',
      name: 'Alice Customer',
      email: 'alice@brisketbox.in',
      role: 'customer',
      walletBalance: 500,
      approvalStatus: 'approved'
    };

    customer2 = {
      id: 'cust_ph_2',
      name: 'Bob Customer',
      email: 'bob@brisketbox.in',
      role: 'customer',
      walletBalance: 300,
      approvalStatus: 'approved'
    };

    riderApproved = {
      id: 'rider_ph_approved',
      name: 'Suresh Patil',
      email: 'suresh@brisketbox.in',
      role: 'rider',
      approvalStatus: 'approved',
      vehicleType: 'EV 2-Wheeler',
      phone: '+91 97412 88301'
    };

    riderUnapproved = {
      id: 'rider_ph_pending',
      name: 'Pending Rider',
      email: 'pending_rider@brisketbox.in',
      role: 'rider',
      approvalStatus: 'pending_approval'
    };

    partnerApproved = {
      id: 'partner_ph_1',
      name: 'Master Butcher Abdul',
      email: 'abdul@brisketbox.in',
      role: 'partner',
      shopId: 'shop_ph_1',
      approvalStatus: 'approved'
    };

    adminUser = {
      id: 'admin_ph_1',
      name: 'System Admin',
      email: 'admin@brisketbox.in',
      role: 'admin',
      approvalStatus: 'approved'
    };

    await User.create([customer1, customer2, riderApproved, riderUnapproved, partnerApproved, adminUser]);

    customer1Token = createToken(customer1);
    customer2Token = createToken(customer2);
    riderApprovedToken = createToken(riderApproved);
    riderUnapprovedToken = createToken(riderUnapproved);
    partnerToken = createToken(partnerApproved);
    adminToken = createToken(adminUser);

    // Seed test products
    await Product.create([
      {
        id: 'prod_test_seer',
        name: 'Seer Fish Steaks',
        category: 'Fish & Seafood',
        description: 'Fresh coastal seer fish round steaks',
        price: 500,
        mrp: 600,
        unit: '500g',
        netWeight: '450g',
        grossWeight: '550g',
        stock: 10
      },
      {
        id: 'prod_test_mutton',
        name: 'Mutton Curry Cut',
        category: 'Tender Mutton',
        description: 'Tender goat bone-in cuts',
        price: 600,
        mrp: 700,
        unit: '500g',
        netWeight: '500g',
        grossWeight: '600g',
        stock: 5
      }
    ]);

    // Seed test cooler
    await Cooler.create([
      {
        id: 'BOX-TEST-101',
        coolerCode: 'BOX-TEST-101',
        qrCode: 'BOX-TEST-101',
        status: 'available',
        depositAmount: 250
      }
    ]);

    // Synchronize db cache with MongoDB
    await db.syncWithMongo();
  });

  after(async () => {
    try {
      await mongoose.disconnect();
      if (replSet) {
        await replSet.stop();
      }
    } finally {
      setTimeout(() => process.exit(0), 200).unref();
    }
  });

  // =========================================================================
  // GROUP 1: DATABASE & ATOMIC INCREMENTS (NO LOCAL $SET OVERWRITE)
  // =========================================================================
  describe('Group 1: Database Architecture & Atomic Increments', () => {
    it('1.1 should atomically deduct stock with $inc without executing local memory $set overwrites', async () => {
      const deductionResult = await deductStock([{ productId: 'prod_test_seer', quantity: 3 }]);
      assert.equal(deductionResult.success, true);

      // Verify directly from MongoDB source of truth
      const prodInMongo = await Product.findOne({ id: 'prod_test_seer' }).lean();
      assert.equal(prodInMongo.stock, 7);
    });

    it('1.2 should atomically rollback partial batch if any product exceeds available stock', async () => {
      await assert.rejects(async () => {
        await deductStock([
          { productId: 'prod_test_seer', quantity: 2 },
          { productId: 'prod_test_mutton', quantity: 99 } // Exceeds stock of 5
        ]);
      }, /Insufficient stock/);

      // Verify seer fish stock remained rolled back to 7
      const prodInMongo = await Product.findOne({ id: 'prod_test_seer' }).lean();
      assert.equal(prodInMongo.stock, 7);
    });

    it('1.3 should atomically debit wallet and persist in WalletLedger with unique index', async () => {
      const key = `idempotency_debit_test_${Date.now()}`;
      const res = await debitWallet({
        userId: customer1.id,
        amount: 150,
        idempotencyKey: key,
        title: 'Test Order Payment'
      });

      assert.equal(res.success, true);
      assert.equal(res.newBalance, 350);

      const userInMongo = await User.findOne({ id: customer1.id }).lean();
      assert.equal(userInMongo.walletBalance, 350);

      const ledgerDoc = await WalletLedger.findOne({ idempotencyKey: key }).lean();
      assert.ok(ledgerDoc);
      assert.equal(ledgerDoc.amount, 150);

      // Replaying the exact same idempotency key returns idempotent replay without double debit
      const replayRes = await debitWallet({
        userId: customer1.id,
        amount: 150,
        idempotencyKey: key
      });
      assert.equal(replayRes.isIdempotentReplay, true);
      assert.equal(replayRes.newBalance, 350);

      const userAfterReplay = await User.findOne({ id: customer1.id }).lean();
      assert.equal(userAfterReplay.walletBalance, 350);
    });
  });

  // =========================================================================
  // GROUP 2: ORDER RULES & STATE MACHINE ENFORCEMENT
  // =========================================================================
  describe('Group 2: Order Rules & State Machine Security', () => {
    let testOrder;

    before(async () => {
      testOrder = await Order.create({
        id: 'ORD-SEC-001',
        orderNumber: 'ORD-SEC-001',
        userId: customer1.id,
        customerName: customer1.name,
        customerEmail: customer1.email,
        customerPhone: '+91 98765 00000',
        deliveryAddress: 'Flat 402, Alpine Eco, Bengaluru',
        partnerId: partnerApproved.shopId,
        riderId: null, // Unassigned
        orderStatus: 'CONFIRMED',
        lifecycleStatus: 'CONFIRMED',
        status: 'Order Confirmed',
        subtotal: 500,
        total: 500,
        totalAmount: 500,
        stockDeducted: true,
        walletDeduction: 100,
        deliveryPin: '4821',
        coolerId: 'BOX-TEST-101',
        items: [{ productId: 'prod_test_seer', name: 'Seer Fish Steaks', quantity: 1, price: 500 }]
      });
      db.insert('orders', testOrder.toObject());
    });

    it('2.1 should reject status update to DELIVERED via status route (prevents PIN bypass)', async () => {
      // Test different case variations: DELIVERED, delivered, Delivered
      for (const val of ['DELIVERED', 'delivered', 'Delivered']) {
        const res = await request(app)
          .patch(`/api/orders/${testOrder.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: val });

        assert.equal(res.status, 400);
        assert.match(res.body.error, /Orders can only be marked DELIVERED via the \/api\/orders\/:id\/handover route/);
      }
    });

    it('2.2 should enforce canRoleExecuteTransition: Rider cannot move CONFIRMED order to PACKED', async () => {
      const res = await request(app)
        .patch(`/api/orders/${testOrder.id}/status`)
        .set('Authorization', `Bearer ${riderApprovedToken}`)
        .send({ status: 'PACKED' });

      // Rider is neither assigned (riderId is null) nor permitted for CONFIRMED -> PACKED
      assert.equal(res.status, 403);
    });

    it('2.3 a null riderId must NOT grant access to riders', async () => {
      const res = await request(app)
        .post(`/api/orders/${testOrder.id}/handover`)
        .set('Authorization', `Bearer ${riderApprovedToken}`)
        .send({ pin: '4821' });

      assert.equal(res.status, 403);
      assert.match(res.body.error, /Access denied/);
    });

    it('2.4 handover is allowed ONLY from OUT_FOR_DELIVERY or ARRIVED', async () => {
      // Assign rider to order, but order is still in CONFIRMED status
      await Order.findOneAndUpdate({ id: testOrder.id }, { $set: { riderId: riderApproved.id } });
      db.update('orders', testOrder.id, { riderId: riderApproved.id });

      const res = await request(app)
        .post(`/api/orders/${testOrder.id}/handover`)
        .set('Authorization', `Bearer ${riderApprovedToken}`)
        .send({ pin: '4821' });

      assert.equal(res.status, 400);
      assert.match(res.body.error, /Order handover is only permitted from 'OUT_FOR_DELIVERY' or 'ARRIVED'/);
    });

    it('2.5 riders cannot cancel orders under any circumstances', async () => {
      const res = await request(app)
        .post(`/api/orders/${testOrder.id}/cancel`)
        .set('Authorization', `Bearer ${riderApprovedToken}`)
        .send({ reason: 'Rider cancelled' });

      assert.equal(res.status, 403);
      assert.match(res.body.error, /Delivery riders are not permitted to cancel orders/);
    });

    it('2.6 customer cancellation must use unified cancelOrder to restore stock, refund wallet, and release cooler', async () => {
      const cancelRes = await request(app)
        .post(`/api/orders/${testOrder.id}/cancel`)
        .set('Authorization', `Bearer ${customer1Token}`)
        .send({ reason: 'Plans changed' });

      assert.equal(cancelRes.status, 200);
      assert.equal(cancelRes.body.success, true);
      assert.equal(cancelRes.body.order.orderStatus, 'CANCELLED');

      // Verify stock was restored
      const seerInMongo = await Product.findOne({ id: 'prod_test_seer' }).lean();
      assert.equal(seerInMongo.stock, 8); // 7 + 1 = 8

      // Verify cooler was released
      const coolerInMongo = await Cooler.findOne({ id: 'BOX-TEST-101' }).lean();
      assert.equal(coolerInMongo.status, 'available');
    });
  });

  // =========================================================================
  // GROUP 3: PAYMENTS, FINALIZER, GUEST CHECKOUT & COOLER RESERVATIONS
  // =========================================================================
  describe('Group 3: Payments, Finalization, Guest Tokens & Coolers', () => {
    let onlineOrder;

    it('3.1 create-order for online payment must NOT reserve cooler before payment is confirmed', async () => {
      const res = await request(app)
        .post('/api/payments/create-order')
        .send({
          items: [{ productId: 'prod_test_mutton', quantity: 1 }],
          deliveryAddress: '123 Baker Street, Bengaluru',
          paymentMethod: 'razorpay'
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.guestToken, 'Guest token must be generated for online checkout');

      onlineOrder = res.body;

      // Ensure cooler was NOT assigned in advance
      const coolerInMongo = await Cooler.findOne({ id: 'BOX-TEST-101' }).lean();
      assert.equal(coolerInMongo.status, 'available');
    });

    it('3.2 /payments/status/:orderId must require owner authentication, admin, or valid guestToken', async () => {
      // 1. Unauthenticated request without guestToken rejected
      const unauthRes = await request(app)
        .get(`/api/payments/status/${onlineOrder.orderNumber}`);
      assert.equal(unauthRes.status, 403);

      // 2. Another customer cannot inspect it
      const otherCustRes = await request(app)
        .get(`/api/payments/status/${onlineOrder.orderNumber}`)
        .set('Authorization', `Bearer ${customer2Token}`);
      assert.equal(otherCustRes.status, 403);

      // 3. Request with valid guestToken in header succeeds
      const guestRes = await request(app)
        .get(`/api/payments/status/${onlineOrder.orderNumber}`)
        .set('x-guest-token', onlineOrder.guestToken);
      assert.equal(guestRes.status, 200);
      assert.equal(guestRes.body.orderNumber, onlineOrder.orderNumber);

      // 4. Admin succeeds
      const adminRes = await request(app)
        .get(`/api/payments/status/${onlineOrder.orderNumber}`)
        .set('Authorization', `Bearer ${adminToken}`);
      assert.equal(adminRes.status, 200);
    });

    it('3.3 finalizePayment should assign a real approved rider and deduct stock upon payment', async () => {
      const finalResult = await finalizePayment({
        orderId: onlineOrder.orderNumber,
        razorpayPaymentId: 'pay_test_capture_123',
        razorpayOrderId: onlineOrder.razorpayOrderId,
        amountInPaise: 60000,
        currency: 'INR',
        source: 'verify'
      });

      assert.equal(finalResult.success, true);
      assert.equal(finalResult.order.paymentStatus, 'PAID');
      assert.equal(finalResult.order.orderStatus, 'CONFIRMED');
      assert.equal(finalResult.order.riderId, riderApproved.id);
      assert.equal(finalResult.order.stockDeducted, true);

      // Cooler was assigned upon payment capture
      assert.ok(finalResult.order.coolerId);
    });

    it('3.4 finalizePayment must move order to REFUND_REQUIRED if items are out of stock', async () => {
      // Create order with mutton
      const outOfStockOrder = await Order.create({
        id: 'ORD-OOS-001',
        orderNumber: 'ORD-OOS-001',
        userId: customer1.id,
        customerName: customer1.name,
        customerEmail: customer1.email,
        customerPhone: '+91 98765 00000',
        deliveryAddress: 'Flat 402, Alpine Eco, Bengaluru',
        orderStatus: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        subtotal: 5000,
        total: 5000,
        totalAmount: 5000,
        stockDeducted: false,
        items: [{ productId: 'prod_test_mutton', name: 'Mutton Curry Cut', quantity: 999, price: 600 }] // 999 exceeds available stock
      });
      db.insert('orders', outOfStockOrder.toObject());

      const res = await finalizePayment({
        orderId: outOfStockOrder.id,
        razorpayPaymentId: 'pay_oos_999',
        source: 'verify'
      });

      assert.equal(res.success, false);
      assert.equal(res.refundRequired, true);
      assert.equal(res.order.orderStatus, 'REFUND_REQUIRED');
      assert.equal(res.order.stockDeducted, false);
    });
  });

  // =========================================================================
  // GROUP 4: REGISTRATION RESILIENCE (MALFORMED RECORDS DO NOT CRASH)
  // =========================================================================
  describe('Group 4: Registration Resilience', () => {
    it('4.1 should return 400 without crashing on malformed customer registration', async () => {
      const malformedBodies = [
        {},
        { email: 12345 },
        { name: 'Test', email: 'test@mail.com', password: {} },
        { email: null, password: null }
      ];

      for (const body of malformedBodies) {
        const res = await request(app)
          .post('/api/auth/register')
          .send(body);
        assert.equal(res.status, 400);
      }
    });

    it('4.2 should return 400 without crashing on malformed rider registration', async () => {
      const res = await request(app)
        .post('/api/rider/register')
        .send({ phone: 9999999999 }); // Non-string phone and missing required fields

      assert.equal(res.status, 400);
    });

    it('4.3 should return 400 without crashing on malformed partner registration', async () => {
      const res = await request(app)
        .post('/api/partner/register')
        .send({ shopName: null, email: false });

      assert.equal(res.status, 400);
    });
  });

  // =========================================================================
  // GROUP 5: CONCURRENT REQUESTS FROM TWO APP INSTANCES SHARING ONE DATABASE
  // =========================================================================
  describe('Group 5: Concurrent Requests from Two App Instances Sharing One Database', () => {
    it('5.1 two app instances should safely compete for stock with atomic isolation', async () => {
      // Product starts with 4 units of stock
      await Product.findOneAndUpdate({ id: 'prod_test_seer' }, { $set: { stock: 4 } });

      // Instance A and Instance B both try to deduct 3 units concurrently
      // 3 + 3 = 6 > 4, so exactly ONE instance must succeed and ONE must fail
      const [resA, resB] = await Promise.allSettled([
        deductStock([{ productId: 'prod_test_seer', quantity: 3 }]),
        deductStock([{ productId: 'prod_test_seer', quantity: 3 }])
      ]);

      const successCount = [resA, resB].filter(r => r.status === 'fulfilled').length;
      const rejectedCount = [resA, resB].filter(r => r.status === 'rejected').length;

      assert.equal(successCount, 1, 'Exactly one concurrent deduction should succeed');
      assert.equal(rejectedCount, 1, 'Exactly one concurrent deduction should fail');

      const finalProd = await Product.findOne({ id: 'prod_test_seer' }).lean();
      assert.equal(finalProd.stock, 1, 'Remaining stock must accurately reflect exactly one deduction (4 - 3 = 1)');
    });

    it('5.2 two app instances should safely debit wallet with atomic isolation', async () => {
      // Customer has 200 balance
      await User.findOneAndUpdate({ id: customer2.id }, { $set: { walletBalance: 200 } });

      // Both instances attempt to debit 150 concurrently with distinct keys
      // 150 + 150 = 300 > 200, so exactly ONE must succeed and ONE must fail with insufficient balance
      const [resA, resB] = await Promise.allSettled([
        debitWallet({
          userId: customer2.id,
          amount: 150,
          idempotencyKey: `conc_k1_${Date.now()}`
        }),
        debitWallet({
          userId: customer2.id,
          amount: 150,
          idempotencyKey: `conc_k2_${Date.now()}`
        })
      ]);

      const successCount = [resA, resB].filter(r => r.status === 'fulfilled').length;
      const rejectedCount = [resA, resB].filter(r => r.status === 'rejected').length;

      assert.equal(successCount, 1, 'Exactly one concurrent debit must succeed');
      assert.equal(rejectedCount, 1, 'The other concurrent debit must fail due to insufficient balance');

      const finalUser = await User.findOne({ id: customer2.id }).lean();
      assert.equal(finalUser.walletBalance, 50, 'Remaining balance must be exactly 200 - 150 = 50');
    });
  });
});
