import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

const localBinaryPath = 'C:\\Users\\dines\\.cache\\mongodb-binaries\\mongod-x64-win32-5.0.19.exe';
const systemBinary = process.env.MONGOMS_SYSTEM_BINARY || (fs.existsSync(localBinaryPath) ? localBinaryPath : undefined);
const JWT_SECRET = 'test_jwt_secret_audit_hardening_key_32bytes_long!';
const WEBHOOK_SECRET = 'test_webhook_secret_key_12345';
const PORT_A = 7083;
const PORT_B = 7084;
const URL_A = `http://127.0.0.1:${PORT_A}`;
const URL_B = `http://127.0.0.1:${PORT_B}`;

let replSet;
let mongoUri;
let procA;
let procB;

let User;
let Product;
let Order;
let DeliverySlot;

function createToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role || 'customer', email: user.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function makeWebhookSignature(payloadStr) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadStr).digest('hex');
}

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
      lastErr = `HTTP ${res.status}: ${await res.text()}`;
    } catch (e) {
      lastErr = `${e.message} (cause: ${e.cause?.code || e.cause?.message || e.cause})`;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} failed to start within ${timeoutMs}ms. Last error: ${lastErr}`);
}

async function request(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const fetchOptions = {
    method: options.method || 'GET',
    headers
  };
  if (options.body) {
    fetchOptions.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
  }
  const res = await fetch(url, fetchOptions);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return { status: res.status, data };
}

describe('Delivery Slot Capacity Leak Hardening Suite (Two Server Processes, MongoMemoryReplSet)', { timeout: 180000 }, () => {
  let customerA;
  let customerB;
  let tokenA;
  let tokenB;
  let testProduct;

  before(async () => {
    // 1. Start MongoMemoryReplSet
    console.log('[Test Setup] Starting MongoMemoryReplSet for slot capacity leak tests...');
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
      binary: systemBinary ? { systemBinary } : { version: '7.0.14' }
    });
    mongoUri = replSet.getUri();
    console.log('[Test Setup] ReplSet running at:', mongoUri);

    // 2. Connect test runner Mongoose to verify directly against MongoDB
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    const models = await import('../mongo.js');
    User = models.User;
    Product = models.Product;
    Order = models.Order;
    DeliverySlot = (await import('../models/DeliverySlot.js')).DeliverySlot;

    // Seed test product
    testProduct = await Product.create({
      id: 'prod_slot_test_item',
      name: 'Surmai Fish Steaks For Slot Tests',
      description: 'Fresh test seer fish steaks',
      price: 499,
      mrp: 549,
      category: 'fish',
      stock: 500,
      unit: '500g',
      netWeight: '500g',
      grossWeight: '550g',
      inStock: true
    });

    customerA = await User.create({
      id: 'user_slot_cust_a',
      name: 'Slot Customer A',
      email: 'slot_a@example.com',
      role: 'customer',
      walletBalance: 0
    });
    tokenA = createToken(customerA);

    customerB = await User.create({
      id: 'user_slot_cust_b',
      name: 'Slot Customer B',
      email: 'slot_b@example.com',
      role: 'customer',
      walletBalance: 0
    });
    tokenB = createToken(customerB);

    // 3. Spawn TWO SEPARATE NODE PROCESSES running server.js
    const serverPath = path.resolve('backend/server.js');
    const backendCwd = path.resolve('backend');

    const envA = {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(PORT_A),
      MONGODB_URI: mongoUri,
      JWT_SECRET,
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RAZORPAY_KEY_ID: 'rzp_test_placeholder',
      RAZORPAY_KEY_SECRET: 'rzp_test_sec_placeholder',
      MAX_USER_ACTIVE_HOLDS: '2',
      MAX_ORDERS_PER_SLOT: '10',
      NODE_ENV: 'test'
    };

    const envB = {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(PORT_B),
      MONGODB_URI: mongoUri,
      JWT_SECRET,
      RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
      RAZORPAY_KEY_ID: 'rzp_test_placeholder',
      RAZORPAY_KEY_SECRET: 'rzp_test_sec_placeholder',
      MAX_USER_ACTIVE_HOLDS: '2',
      MAX_ORDERS_PER_SLOT: '10',
      NODE_ENV: 'test'
    };

    const mockBootstrapUrl = pathToFileURL(path.resolve('backend/tests/helpers/mockRazorpayBootstrap.js')).href;

    console.log('[Test Setup] Spawning Node Process A on port', PORT_A);
    procA = spawn(process.execPath, ['--import', mockBootstrapUrl, serverPath], { cwd: backendCwd, env: envA, stdio: ['ignore', 'pipe', 'pipe'] });
    procA.stdout.on('data', d => console.log('[Proc A stdout]', d.toString().trim()));
    procA.stderr.on('data', d => console.error('[Proc A stderr]', d.toString().trim()));

    console.log('[Test Setup] Spawning Node Process B on port', PORT_B);
    procB = spawn(process.execPath, ['--import', mockBootstrapUrl, serverPath], { cwd: backendCwd, env: envB, stdio: ['ignore', 'pipe', 'pipe'] });
    procB.stdout.on('data', d => console.log('[Proc B stdout]', d.toString().trim()));
    procB.stderr.on('data', d => console.error('[Proc B stderr]', d.toString().trim()));

    // Wait for both servers to be online
    await Promise.all([waitForServer(URL_A), waitForServer(URL_B)]);
    console.log('[Test Setup] Both Process A and Process B online!');
  });

  beforeEach(async () => {
    await DeliverySlot.deleteMany({});
    await Order.deleteMany({});
  });

  after(async () => {
    console.log('[Teardown] Shutting down child processes...');
    if (procA) procA.kill('SIGTERM');
    if (procB) procB.kill('SIGTERM');
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
  });

  // =========================================================================
  // Test 1: Inexact slot id is rejected
  // =========================================================================
  it('1. Inexact slot id is rejected (no partial label matching)', async () => {
    // 1. Sending human label instead of exact slot id must fail
    const resLabel = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: 'Today, 06:00 AM - 08:00 AM',
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resLabel.status, 400);
    assert.match(resLabel.data.error, /invalid delivery slot id/i);

    // 2. Sending partial substring must fail
    const resPartial = await request(URL_B, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlot: '06-08',
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resPartial.status, 400);
    assert.match(resPartial.data.error, /invalid delivery slot id/i);
  });

  // =========================================================================
  // Test 2: An abandoned online order frees the place after the hold expires
  // =========================================================================
  it('2. An abandoned online order frees the place after the hold expires', async () => {
    // Retrieve tomorrow's slot so cut-off time is far away
    const slotsRes = await request(URL_A, '/api/delivery/slots');
    assert.equal(slotsRes.status, 200);
    const targetSlot = slotsRes.data.slots.find(s => !s.isToday) || slotsRes.data.slots[0];
    assert.ok(targetSlot, 'Must have a target slot');

    // Pre-seed this slot with maxOrders = 1, confirmedCount = 0, holds = []
    await DeliverySlot.findOneAndUpdate(
      { slotId: targetSlot.id },
      { $set: { maxOrders: 1, confirmedCount: 0, bookedCount: 0, holds: [] } },
      { upsert: true }
    );

    // Customer A books slot on Process A (creates an unexpired hold)
    const resA = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resA.status, 200, `Process A booking failed: ${JSON.stringify(resA.data)}`);
    const orderA = resA.data;

    // Verify hold exists in DB
    const slotDoc = await DeliverySlot.findOne({ slotId: targetSlot.id }).lean();
    assert.equal(slotDoc.holds.length, 1);

    // While hold is unexpired, Process B attempts to book slot -> REJECTED (fully booked)
    const resBlocked = await request(URL_B, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resBlocked.status, 400);
    assert.match(resBlocked.data.error, /fully booked|select another slot/i);

    // Customer A abandons the order. Simulate expiry by manually setting hold expiresAt to 20 minutes ago in DB
    const expiredTime = new Date(Date.now() - 20 * 60 * 1000);
    await DeliverySlot.updateOne(
      { slotId: targetSlot.id, "holds.orderId": orderA.orderNumber },
      { $set: { "holds.$.expiresAt": expiredTime } }
    );
    await Order.updateOne(
      { id: orderA.orderId },
      { $set: { holdExpiresAt: expiredTime } }
    );

    // Customer B now attempts to book slot on Process B -> SUCCEEDS because expired hold stops counting!
    const resB = await request(URL_B, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resB.status, 200, `Process B should succeed after hold expired, got: ${JSON.stringify(resB.data)}`);

    // Clean up
    await DeliverySlot.deleteOne({ slotId: targetSlot.id });
  });

  // =========================================================================
  // Test 3: payment.failed frees it immediately
  // =========================================================================
  it('3. payment.failed webhook frees slot hold immediately', async () => {
    const slotsRes = await request(URL_A, '/api/delivery/slots');
    const targetSlot = slotsRes.data.slots.find(s => !s.isToday) || slotsRes.data.slots[0];

    // Slot with capacity 1
    await DeliverySlot.findOneAndUpdate(
      { slotId: targetSlot.id },
      { $set: { maxOrders: 1, confirmedCount: 0, bookedCount: 0, holds: [] } },
      { upsert: true }
    );

    // Customer A books slot on Process A
    const resA = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resA.status, 200);
    const orderA = resA.data;

    // Immediately send payment.failed webhook to Process B
    const webhookPayload = JSON.stringify({
      entity: 'event',
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_fail_${Date.now()}`,
            order_id: orderA.razorpayOrderId,
            amount: orderA.amount,
            status: 'failed'
          }
        }
      }
    });
    const sig = makeWebhookSignature(webhookPayload);

    const webhookRes = await request(URL_B, '/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': sig },
      body: webhookPayload
    });
    assert.equal(webhookRes.status, 200);

    // Verify order in DB has slotReleased: true
    const updatedOrder = await Order.findOne({ id: orderA.orderId }).lean();
    assert.equal(updatedOrder.slotReleased, true);

    // Process A can now book the freed place immediately!
    const resAfterFail = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resAfterFail.status, 200, 'Slot should be freed immediately after payment.failed');

    await DeliverySlot.deleteOne({ slotId: targetSlot.id });
  });

  // =========================================================================
  // Test 4: Cancel frees it exactly once, even when called twice concurrently
  // =========================================================================
  it('4. Cancel frees slot exactly once, even when called twice concurrently across Process A & B', async () => {
    const slotsRes = await request(URL_A, '/api/delivery/slots');
    const targetSlot = slotsRes.data.slots.find(s => !s.isToday) || slotsRes.data.slots[0];

    // Start with maxOrders = 10, confirmedCount = 5, holds = []
    await DeliverySlot.findOneAndUpdate(
      { slotId: targetSlot.id },
      { $set: { maxOrders: 10, confirmedCount: 5, bookedCount: 5, holds: [] } },
      { upsert: true }
    );

    // Create a confirmed COD order (has confirmed place)
    const resOrder = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'cod'
      }
    });
    assert.equal(resOrder.status, 201);
    const orderId = resOrder.data.order.id;

    // Slot confirmedCount is now 6
    const slotBefore = await DeliverySlot.findOne({ slotId: targetSlot.id }).lean();
    assert.equal(slotBefore.confirmedCount, 6);

    // Fire TWO concurrent cancel requests: one to Process A, one to Process B
    const [cancelResA, cancelResB] = await Promise.all([
      request(URL_A, `/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { reason: 'Customer changed mind A' }
      }),
      request(URL_B, `/api/orders/${orderId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA}` },
        body: { reason: 'Customer changed mind B' }
      })
    ]);

    const statuses = [cancelResA.status, cancelResB.status];
    const successes = statuses.filter(s => s === 200);
    const failures = statuses.filter(s => s === 400);

    assert.equal(successes.length, 1, `Exactly one cancel should succeed, got: ${statuses.join(', ')}`);
    assert.equal(failures.length, 1, `Second cancel should be rejected, got: ${statuses.join(', ')}`);

    // Verify slot capacity in DB: confirmedCount must be decremented by EXACTLY 1 (from 6 to 5), NEVER 4!
    const slotAfter = await DeliverySlot.findOne({ slotId: targetSlot.id }).lean();
    assert.equal(slotAfter.confirmedCount, 5, 'confirmedCount must be decremented exactly once!');

    // Verify order slotReleased flag is true
    const orderDoc = await Order.findOne({ id: orderId }).lean();
    assert.equal(orderDoc.slotReleased, true);

    await DeliverySlot.deleteOne({ slotId: targetSlot.id });
  });

  // =========================================================================
  // Test 5: A paid order keeps its place
  // =========================================================================
  it('5. A paid order keeps its place even after hold expiration time', async () => {
    const slotsRes = await request(URL_A, '/api/delivery/slots');
    const targetSlot = slotsRes.data.slots.find(s => !s.isToday) || slotsRes.data.slots[0];

    // Capacity 1
    await DeliverySlot.findOneAndUpdate(
      { slotId: targetSlot.id },
      { $set: { maxOrders: 1, confirmedCount: 0, bookedCount: 0, holds: [] } },
      { upsert: true }
    );

    // Customer A books slot on Process A
    const resA = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resA.status, 200);
    const orderA = resA.data;

    // Finalize payment on Process B via /api/payments/verify
    const verifyRes = await request(URL_B, '/api/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: {
        orderId: orderA.orderId,
        razorpay_order_id: orderA.razorpayOrderId,
        razorpay_payment_id: `pay_paid_${Date.now()}`,
        razorpay_signature: 'SERVER_SIMULATED_SIG'
      }
    });
    assert.equal(verifyRes.status, 200, `Payment verification failed: ${JSON.stringify(verifyRes.data)}`);

    // Slot confirmedCount is now 1, hold was converted
    const slotPaid = await DeliverySlot.findOne({ slotId: targetSlot.id }).lean();
    assert.equal(slotPaid.confirmedCount, 1);

    // Now fast-forward time in the future by 1 hour (past 15-minute hold expiry)
    // Process B attempts to book slot -> REJECTED because the paid order permanently booked the place!
    const resBlocked = await request(URL_B, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: targetSlot.id,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(resBlocked.status, 400);
    assert.match(resBlocked.data.error, /fully booked|select another slot/i);

    await DeliverySlot.deleteOne({ slotId: targetSlot.id });
  });

  // =========================================================================
  // Test 6: The 3rd unpaid hold for the same user is refused
  // =========================================================================
  it('6. The 3rd unpaid hold for the same user is refused', async () => {
    const slotsRes = await request(URL_A, '/api/delivery/slots');
    const available = slotsRes.data.slots.filter(s => !s.isToday);
    const slot1 = available[0].id;
    const slot2 = available[1].id;
    const slot3 = available[2].id;

    // Unique user for this test
    const multiHoldUser = await User.create({
      id: `user_multi_hold_${Date.now()}`,
      name: 'Multi Hold Tester',
      email: `multi_hold_${Date.now()}@test.com`,
      role: 'customer',
      walletBalance: 0
    });
    const multiToken = createToken(multiHoldUser);

    // 1st Hold: on Process A -> Succeeds
    const res1 = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${multiToken}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: slot1,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(res1.status, 200, `1st hold should succeed, got: ${JSON.stringify(res1.data)}`);

    // 2nd Hold: on Process B -> Succeeds
    const res2 = await request(URL_B, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${multiToken}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: slot2,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(res2.status, 200, '2nd hold should succeed');

    // 3rd Hold: on Process A -> MUST BE REFUSED (400 limit reached)
    const res3 = await request(URL_A, '/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${multiToken}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlotId: slot3,
        paymentMethod: 'razorpay'
      }
    });
    assert.equal(res3.status, 400);
    assert.match(res3.data.error, /maximum limit of 2 active unpaid/i);
  });

  // =========================================================================
  // Test 7: Two simultaneous first orders on a brand-new slot both succeed
  // =========================================================================
  it('7. Two simultaneous first orders on a brand-new slot both succeed (E11000 retry)', async () => {
    // Generate a brand-new slot id that exists in available windows but NOT in MongoDB
    const slotsRes = await request(URL_A, '/api/delivery/slots');
    const targetSlot = slotsRes.data.slots.find(s => !s.isToday);
    assert.ok(targetSlot);

    // Ensure slot document is completely deleted from MongoDB
    await DeliverySlot.deleteOne({ slotId: targetSlot.id });

    // Distinct users
    const user1 = await User.create({
      id: `user_first_1_${Date.now()}`,
      name: 'First Orderer 1',
      email: `first1_${Date.now()}@test.com`,
      role: 'customer'
    });
    const user2 = await User.create({
      id: `user_first_2_${Date.now()}`,
      name: 'First Orderer 2',
      email: `first2_${Date.now()}@test.com`,
      role: 'customer'
    });

    const token1 = createToken(user1);
    const token2 = createToken(user2);

    // Launch two simultaneous first orders on Process A and Process B
    const [resA, resB] = await Promise.all([
      request(URL_A, '/api/payments/create-order', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token1}` },
        body: {
          items: [{ productId: testProduct.id, quantity: 1 }],
          deliverySlotId: targetSlot.id,
          paymentMethod: 'razorpay'
        }
      }),
      request(URL_B, '/api/payments/create-order', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token2}` },
        body: {
          items: [{ productId: testProduct.id, quantity: 1 }],
          deliverySlotId: targetSlot.id,
          paymentMethod: 'razorpay'
        }
      })
    ]);

    assert.equal(resA.status, 200, `Process A order should succeed, got: ${JSON.stringify(resA.data)}`);
    assert.equal(resB.status, 200, `Process B order should succeed, got: ${JSON.stringify(resB.data)}`);

    // Verify slot document exists in MongoDB with both holds recorded
    const slotFinal = await DeliverySlot.findOne({ slotId: targetSlot.id }).lean();
    assert.ok(slotFinal, 'DeliverySlot document must exist in DB');
    assert.equal(slotFinal.holds.length, 2, 'Both holds must be recorded in DB');

    await DeliverySlot.deleteOne({ slotId: targetSlot.id });
  });
});
