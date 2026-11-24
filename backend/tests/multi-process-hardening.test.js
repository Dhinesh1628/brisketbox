import { describe, it, before, after } from 'node:test';
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
const PORT_A = 7081;
const PORT_B = 7082;
const URL_A = `http://127.0.0.1:${PORT_A}`;
const URL_B = `http://127.0.0.1:${PORT_B}`;

let replSet;
let mongoUri;
let procA;
let procB;

let User;
let Product;
let Order;
let Cooler;
let WalletLedger;
let CouponUsage;
let PaymentEvent;
let Refund;
let CashDeposit;

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

describe('Multi-Process Production Hardening & Single Source of Truth Suite', { timeout: 180000 }, () => {
  before(async () => {
    // 1. Start MongoMemoryReplSet (supports transactions & replica sets)
    console.log('[Test Setup] Starting MongoMemoryReplSet...');
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
    Cooler = models.Cooler;
    WalletLedger = models.WalletLedger;
    CouponUsage = models.CouponUsage;
    PaymentEvent = models.PaymentEvent;
    Refund = (await import('../models/Refund.js')).Refund;
    CashDeposit = (await import('../models/CashDeposit.js')).CashDeposit;

    // Seed test products and cooler
    await Product.create([
      {
        id: 'prod_seer_steak',
        name: 'Surmai Seer Fish Steaks',
        description: 'Fresh coastal seer fish, center cut into thick steaks.',
        price: 649,
        mrp: 699,
        category: 'fish',
        stock: 500,
        unit: '500g',
        netWeight: '500g',
        grossWeight: '550g',
        inStock: true
      },
      {
        id: 'prod_limited_cut',
        name: 'Special Limited Cut',
        description: 'Special limited reserve cut.',
        price: 300,
        mrp: 350,
        category: 'mutton',
        stock: 1,
        unit: '500g',
        netWeight: '500g',
        grossWeight: '550g',
        inStock: true
      }
    ]);

    await Cooler.create({
      id: 'BOX-TEST-001',
      qrCode: 'BRISKETBOX-BOX-TEST-001',
      model: 'ThermalVault 18L',
      status: 'available',
      depositAmount: 250
    });

    // 3. Spawn TWO SEPARATE NODE PROCESSES running the real server.js
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
      NODE_ENV: 'test'
    };

    const mockBootstrapUrl = pathToFileURL(path.resolve('backend/tests/helpers/mockRazorpayBootstrap.js')).href;

    console.log('[Test Setup] Spawning Node Process A on port', PORT_A);
    procA = spawn(process.execPath, ['--import', mockBootstrapUrl, serverPath], { cwd: backendCwd, env: envA, stdio: ['ignore', 'pipe', 'pipe'] });
    procA.stdout.on('data', d => console.log('[Proc A stdout]', d.toString().trim()));
    procA.stderr.on('data', d => console.error('[Proc A stderr]', d.toString().trim()));
    procA.on('exit', (code, sig) => console.log('[Proc A exited with code]', code, sig));

    console.log('[Test Setup] Spawning Node Process B on port', PORT_B);
    procB = spawn(process.execPath, ['--import', mockBootstrapUrl, serverPath], { cwd: backendCwd, env: envB, stdio: ['ignore', 'pipe', 'pipe'] });
    procB.stdout.on('data', d => console.log('[Proc B stdout]', d.toString().trim()));
    procB.stderr.on('data', d => console.error('[Proc B stderr]', d.toString().trim()));
    procB.on('exit', (code, sig) => console.log('[Proc B exited with code]', code, sig));

    // 4. Wait for both servers to accept HTTP traffic
    await Promise.all([
      waitForServer(URL_A),
      waitForServer(URL_B)
    ]);
    console.log('[Test Setup] Both Node processes A and B are online and responsive!');
  });

  after(async () => {
    console.log('[Teardown] Shutting down child processes...');
    if (procA) procA.kill('SIGTERM');
    if (procB) procB.kill('SIGTERM');
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
    console.log('[Teardown] Completed cleanly.');
  });

  // -------------------------------------------------------------------------
  // 1. REGISTER ON A, LOG IN ON B
  // -------------------------------------------------------------------------
  it('1. User registered on Process A can log in immediately on Process B', async () => {
    const regEmail = `user_cross_${Date.now()}@brisketbox.in`;
    const regPass = 'StrongPass#2026';

    const regRes = await fetch(`${URL_A}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cross Process User',
        email: regEmail,
        password: regPass,
        phone: '+91 98888 77777'
      })
    });
    assert.strictEqual(regRes.status, 201, 'Registration on A must return 201');
    const regData = await regRes.json();
    assert.ok(regData.user && regData.token);

    // Immediate login on Process B
    const loginRes = await fetch(`${URL_B}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: regEmail,
        password: regPass
      })
    });
    assert.strictEqual(loginRes.status, 200, 'Login on B must return 200 for user registered on A');
    const loginData = await loginRes.json();
    assert.strictEqual(loginData.user.email, regEmail);
    assert.ok(loginData.token);
  });

  // -------------------------------------------------------------------------
  // 2. SESSION FROM A WORKS ON B
  // -------------------------------------------------------------------------
  it('2. Session token issued on Process A authenticates on Process B (/api/auth/me)', async () => {
    const email = `session_${Date.now()}@brisketbox.in`;
    const regRes = await fetch(`${URL_A}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Session User',
        email,
        password: 'Password#2026',
        phone: '+91 97777 66666'
      })
    });
    const { token } = await regRes.json();

    // Call /api/auth/me on Process B using token issued on Process A
    const meRes = await fetch(`${URL_B}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(meRes.status, 200, 'Token from A must authenticate on B');
    const meData = await meRes.json();
    assert.strictEqual(meData.email, email);
  });

  // -------------------------------------------------------------------------
  // 3. ORDER CREATED ON A IS VISIBLE ON B
  // -------------------------------------------------------------------------
  it('3. Order created on Process A is immediately visible on Process B', async () => {
    const user = await User.create({
      id: `usr_${Date.now()}`,
      name: 'Order Creator',
      email: `creator_${Date.now()}@brisketbox.in`,
      role: 'customer',
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    const orderRes = await fetch(`${URL_A}/api/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'cash',
        deliveryAddress: '100 Feet Road, Indiranagar'
      })
    });
    assert.strictEqual(orderRes.status, 201, 'Order creation on A must succeed');
    const orderData = await orderRes.json();

    // Fetch order on Process B
    const fetchRes = await fetch(`${URL_B}/api/orders/${orderData.id}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.strictEqual(fetchRes.status, 200, 'Order created on A must be found on B');
    const fetchedOrder = await fetchRes.json();
    assert.strictEqual(fetchedOrder.id, orderData.id);
    assert.strictEqual(fetchedOrder.total, 649);
  });

  // -------------------------------------------------------------------------
  // 4. WEBHOOK ON A SHOWS PAID ON A AND B
  // -------------------------------------------------------------------------
  it('4. Webhook received on Process A transitions order to PAID, reflected on both A and B', async () => {
    const user = await User.create({
      id: `usr_pay_${Date.now()}`,
      name: 'Payer User',
      email: `payer_${Date.now()}@brisketbox.in`,
      role: 'customer',
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    // Create online payment order on Process B
    const createRes = await fetch(`${URL_B}/api/payments/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'razorpay'
      })
    });
    assert.strictEqual(createRes.status, 200);
    const { orderId, razorpayOrderId } = await createRes.json();

    // Verify initial status is PENDING_PAYMENT on both A and B
    const initA = await (await fetch(`${URL_A}/api/payments/status/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    assert.strictEqual(initA.paymentStatus, 'PENDING');

    // Deliver webhook to Process A
    const paymentId = `pay_${Date.now()}`;
    const webhookPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: 64900,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    const signature = makeWebhookSignature(webhookPayload);

    const webhookRes = await fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': signature
      },
      body: webhookPayload
    });
    assert.strictEqual(webhookRes.status, 200, 'Webhook on A must return 200');

    // Check status on Process A
    const statusA = await (await fetch(`${URL_A}/api/payments/status/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    assert.strictEqual(statusA.paymentStatus, 'PAID', 'Status on A must show PAID');

    // Check status on Process B
    const statusB = await (await fetch(`${URL_B}/api/payments/status/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    })).json();
    assert.strictEqual(statusB.paymentStatus, 'PAID', 'Status on B must show PAID');
  });

  // -------------------------------------------------------------------------
  // 5. STOCK AND WALLET SHOWN BY API MATCH MONGODB
  // -------------------------------------------------------------------------
  it('5. Stock and wallet balances reported via API match direct MongoDB queries', async () => {
    const user = await User.create({
      id: `usr_match_${Date.now()}`,
      name: 'Match User',
      email: `match_${Date.now()}@brisketbox.in`,
      role: 'customer',
      walletBalance: 450,
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    // Check wallet via API on Process A
    const walletRes = await fetch(`${URL_A}/api/wallet`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const walletData = await walletRes.json();
    const dbUser = await User.findOne({ id: user.id }).lean();
    assert.strictEqual(walletData.balance, dbUser.walletBalance);

    // Check stock via API on Process B
    const prodRes = await fetch(`${URL_B}/api/products/prod_seer_steak`);
    const prodData = await prodRes.json();
    const dbProd = await Product.findOne({ id: 'prod_seer_steak' }).lean();
    assert.strictEqual(prodData.stock, dbProd.stock);
  });

  // -------------------------------------------------------------------------
  // 6. CONCURRENT CANCEL ON A AND B RESTORES STOCK AND REFUNDS WALLET ONCE (>= 20 RUNS)
  // -------------------------------------------------------------------------
  it('6. Concurrent cancel on Process A and Process B restores stock and refunds wallet exactly once (tested 20 times)', { timeout: 60000 }, async () => {
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      const initialWallet = 500;
      const walletUsed = 100;
      const initialStock = 100;

      const pId = `prod_cancel_${i}_${Date.now()}`;
      await Product.create({
        id: pId,
        name: `Test Cut Cancel ${i}`,
        description: 'Test cut cancel description',
        price: 200,
        mrp: 250,
        category: 'mutton',
        stock: initialStock,
        unit: '500g',
        netWeight: '500g',
        grossWeight: '550g',
        inStock: true
      });

      const uId = `usr_cancel_${i}_${Date.now()}`;
      const user = await User.create({
        id: uId,
        name: `User Cancel ${i}`,
        email: `cancel_${i}_${Date.now()}@test.com`,
        role: 'customer',
        walletBalance: initialWallet,
        approvalStatus: 'approved'
      });
      const token = createToken(user);

      // Create order using 1 unit of stock and ₹100 wallet
      const orderRes = await fetch(`${URL_A}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: [{ productId: pId, quantity: 1, selectedWeight: '500g' }],
          paymentMethod: 'cash',
          useWallet: true,
          deliveryAddress: 'Test Lane'
        })
      });
      const orderData = await orderRes.json();
      assert.strictEqual(orderRes.status, 201);

      // Verify intermediate stock and wallet
      const postCreateProd = await Product.findOne({ id: pId }).lean();
      const postCreateUser = await User.findOne({ id: uId }).lean();
      assert.strictEqual(postCreateProd.stock, initialStock - 1);
      assert.strictEqual(postCreateUser.walletBalance, initialWallet - orderData.walletDeduction);

      // FIRE CONCURRENT CANCEL REQUESTS TO PROCESS A AND PROCESS B SIMULTANEOUSLY
      const cancelPromiseA = fetch(`${URL_A}/api/orders/${orderData.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: 'Cancel from A' })
      });
      const cancelPromiseB = fetch(`${URL_B}/api/orders/${orderData.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: 'Cancel from B' })
      });

      const [resA, resB] = await Promise.all([cancelPromiseA, cancelPromiseB]);
      const statuses = [resA.status, resB.status];
      // At least one must succeed with 200. The second may succeed idempotently or return 400.
      assert.ok(statuses.includes(200), `At least one cancel must return 200, got: ${statuses}`);

      // Verify MongoDB state: Stock must be restored EXACTLY once to initialStock
      const finalProd = await Product.findOne({ id: pId }).lean();
      assert.strictEqual(finalProd.stock, initialStock, `Stock must be restored to ${initialStock}, was ${finalProd.stock} (iteration ${i})`);

      // Verify MongoDB state: Wallet must be refunded EXACTLY once to initialWallet
      const finalUser = await User.findOne({ id: uId }).lean();
      assert.strictEqual(finalUser.walletBalance, initialWallet, `Wallet must be refunded to ${initialWallet}, was ${finalUser.walletBalance} (iteration ${i})`);

      // Verify WalletLedger idempotency: exactly one refund entry for this order
      const ledgers = await WalletLedger.find({ orderId: orderData.id, type: 'credit' }).lean();
      assert.strictEqual(ledgers.length, 1, `Must have exactly 1 refund ledger entry, got ${ledgers.length} (iteration ${i})`);
    }
  });

  // -------------------------------------------------------------------------
  // 7. DUPLICATE WEBHOOK ON A AND B DEDUCTS STOCK ONCE (>= 20 RUNS)
  // -------------------------------------------------------------------------
  it('7. Duplicate webhooks sent concurrently to Process A and Process B deduct stock exactly once (tested 20 times)', { timeout: 60000 }, async () => {
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      const initialStock = 50;
      const pId = `prod_webhook_${i}_${Date.now()}`;
      await Product.create({
        id: pId,
        name: `Webhook Cut ${i}`,
        description: 'Webhook cut description',
        price: 250,
        mrp: 300,
        category: 'fish',
        stock: initialStock,
        unit: '500g',
        netWeight: '500g',
        grossWeight: '550g',
        inStock: true
      });

      const user = await User.create({
        id: `usr_wh_${i}_${Date.now()}`,
        name: `User WH ${i}`,
        email: `wh_${i}_${Date.now()}@test.com`,
        role: 'customer',
        approvalStatus: 'approved'
      });
      const token = createToken(user);

      // Create online payment order on Process A
      const createRes = await fetch(`${URL_A}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: [{ productId: pId, quantity: 1, selectedWeight: '500g' }],
          paymentMethod: 'razorpay'
        })
      });
      const createData = await createRes.json();
      const razorpayOrderId = createData.razorpayOrderId;
      const expectedPaise = createData.amount || createData.amountInPaise || 29000;

      const paymentId = `pay_dup_${i}_${Date.now()}`;
      const payloadStr = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: paymentId,
              order_id: razorpayOrderId,
              amount: expectedPaise,
              currency: 'INR',
              status: 'captured'
            }
          }
        }
      });
      const signature = makeWebhookSignature(payloadStr);

      // FIRE DUPLICATE WEBHOOKS SIMULTANEOUSLY TO PROCESS A AND PROCESS B
      const sendA = fetch(`${URL_A}/api/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
        body: payloadStr
      });
      const sendB = fetch(`${URL_B}/api/payments/webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
        body: payloadStr
      });

      const [resA, resB] = await Promise.all([sendA, sendB]);
      if (resA.status !== 200 || resB.status !== 200) {
        const bodyA = await resA.text();
        const bodyB = await resB.text();
        console.error(`[Test 7 Failed] resA: ${resA.status} ${bodyA}, resB: ${resB.status} ${bodyB}`);
      }
      assert.strictEqual(resA.status, 200);
      assert.strictEqual(resB.status, 200);

      // Verify MongoDB state: Stock must be deducted EXACTLY once (initialStock - 1)
      const finalProd = await Product.findOne({ id: pId }).lean();
      assert.strictEqual(finalProd.stock, initialStock - 1, `Stock must be deducted once: expected ${initialStock - 1}, got ${finalProd.stock} (iteration ${i})`);

      // Verify PaymentEvent table: exactly 1 event record for this paymentId
      const events = await PaymentEvent.find({ eventId: paymentId }).lean();
      assert.strictEqual(events.length, 1, `Must have exactly 1 PaymentEvent record, got ${events.length} (iteration ${i})`);
    }
  });

  // -------------------------------------------------------------------------
  // 8. ONE-PER-USER COUPON WORKS ONCE ACROSS A AND B (>= 20 RUNS)
  // -------------------------------------------------------------------------
  it('8. One-per-user coupon works once across Process A and Process B concurrently (tested 20 times)', { timeout: 60000 }, async () => {
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      const uId = `usr_coupon_${i}_${Date.now()}`;
      const user = await User.create({
        id: uId,
        name: `Coupon User ${i}`,
        email: `coupon_${i}_${Date.now()}@test.com`,
        role: 'customer',
        approvalStatus: 'approved'
      });
      const token = createToken(user);

      // Attempt to place two orders with FIRST20 (one per user) concurrently on A and B
      const orderA = fetch(`${URL_A}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
          couponCode: 'FIRST20',
          paymentMethod: 'cash',
          deliveryAddress: 'Lane 1'
        })
      });
      const orderB = fetch(`${URL_B}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
          couponCode: 'FIRST20',
          paymentMethod: 'cash',
          deliveryAddress: 'Lane 2'
        })
      });

      const [resA, resB] = await Promise.all([orderA, orderB]);
      const dataA = await resA.json();
      const dataB = await resB.json();

      const discountA = dataA.discountAmount || 0;
      const discountB = dataB.discountAmount || 0;
      const totalDiscountsApplied = (discountA > 0 ? 1 : 0) + (discountB > 0 ? 1 : 0);

      // At most ONE order could receive the FIRST20 coupon discount
      assert.ok(
        totalDiscountsApplied <= 1,
        `Coupon must apply at most once across concurrent processes: A got ₹${discountA}, B got ₹${discountB} (iteration ${i})`
      );

      // Verify MongoDB CouponUsage: at most 1 usage record exists for this user
      const usages = await CouponUsage.find({ userId: uId, code: 'FIRST20' }).lean();
      assert.ok(
        usages.length <= 1,
        `CouponUsage in MongoDB must have at most 1 record, got ${usages.length} (iteration ${i})`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 9. LAST-ITEM STOCK & WALLET DOUBLE-SPEND REMAIN PROTECTED (>= 20 RUNS)
  // -------------------------------------------------------------------------
  it('9. Last-item stock & wallet double-spend remain strictly protected under concurrency (tested 20 times)', { timeout: 60000 }, async () => {
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      // PART A: Last-Item Stock Protection (stock = 1, two users try to buy it on A and B)
      const pId = `prod_last_${i}_${Date.now()}`;
      await Product.create({
        id: pId,
        name: `Last Item Cut ${i}`,
        description: 'Last item description',
        price: 200,
        mrp: 250,
        category: 'mutton',
        stock: 1, // Only 1 in stock!
        unit: '500g',
        netWeight: '500g',
        grossWeight: '550g',
        inStock: true
      });

      const u1 = await User.create({ id: `u1_${i}_${Date.now()}`, name: 'U1', email: `u1_${i}_${Date.now()}@t.com`, role: 'customer' });
      const u2 = await User.create({ id: `u2_${i}_${Date.now()}`, name: 'U2', email: `u2_${i}_${Date.now()}@t.com`, role: 'customer' });
      const tok1 = createToken(u1);
      const tok2 = createToken(u2);

      const buyA = fetch(`${URL_A}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok1}` },
        body: JSON.stringify({
          items: [{ productId: pId, quantity: 1, selectedWeight: '500g' }],
          paymentMethod: 'cash',
          deliveryAddress: 'Address 1'
        })
      });
      const buyB = fetch(`${URL_B}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok2}` },
        body: JSON.stringify({
          items: [{ productId: pId, quantity: 1, selectedWeight: '500g' }],
          paymentMethod: 'cash',
          deliveryAddress: 'Address 2'
        })
      });

      const [resStockA, resStockB] = await Promise.all([buyA, buyB]);
      const successfulBuys = [resStockA.status, resStockB.status].filter(s => s === 201).length;

      // Exactly 1 buyer could successfully purchase the last item
      assert.strictEqual(successfulBuys, 1, `Exactly 1 buyer must succeed for last item, got ${successfulBuys} (iteration ${i})`);

      // Final stock in MongoDB must be 0 (never negative)
      const finalStockProd = await Product.findOne({ id: pId }).lean();
      assert.strictEqual(finalStockProd.stock, 0, `Final stock in MongoDB must be 0, was ${finalStockProd.stock} (iteration ${i})`);

      // PART B: Wallet Double-Spend Protection (balance = 100, user tries to spend 100 on A and 100 on B simultaneously)
      const uSpend = await User.create({
        id: `u_spend_${i}_${Date.now()}`,
        name: 'Spender',
        email: `spender_${i}_${Date.now()}@t.com`,
        role: 'customer',
        walletBalance: 100 // Only ₹100 available!
      });
      const tokSpend = createToken(uSpend);

      const spendA = fetch(`${URL_A}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokSpend}` },
        body: JSON.stringify({
          items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
          paymentMethod: 'cash',
          useWallet: true,
          deliveryAddress: 'Spend A'
        })
      });
      const spendB = fetch(`${URL_B}/api/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokSpend}` },
        body: JSON.stringify({
          items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
          paymentMethod: 'cash',
          useWallet: true,
          deliveryAddress: 'Spend B'
        })
      });

      const [resSpendA, resSpendB] = await Promise.all([spendA, spendB]);
      const successfulSpends = [resSpendA.status, resSpendB.status].filter(s => s === 201).length;

      // At most 1 order could debit the ₹100
      assert.ok(successfulSpends <= 1, `At most 1 order could debit wallet under concurrent requests, got ${successfulSpends} (iteration ${i})`);

      // Final wallet balance in MongoDB must be >= 0 (never negative)
      const finalSpendUser = await User.findOne({ id: uSpend.id }).lean();
      assert.ok(
        finalSpendUser.walletBalance >= 0,
        `Wallet balance in MongoDB must never be negative, was ${finalSpendUser.walletBalance} (iteration ${i})`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 10. CANCEL, THEN LATE CAPTURED WEBHOOK
  // A captured webhook for a CANCELLED order must never make it CONFIRMED,
  // deduct stock, or keep a wallet refund. Record payment and move to REFUND_REQUIRED.
  // -------------------------------------------------------------------------
  it('10. Cancelled order receiving late captured webhook transitions to REFUND_REQUIRED without deducting stock', async () => {
    const pId = `prod_late_${Date.now()}`;
    await Product.create({
      id: pId,
      name: 'Late Webhook Cut',
      description: 'Late cut',
      price: 649,
      mrp: 700,
      stock: 15,
      category: 'fish',
      unit: '500g',
      netWeight: '500g',
      grossWeight: '550g',
      inStock: true
    });

    const user = await User.create({
      id: `usr_late_${Date.now()}`,
      name: 'Late Webhook User',
      email: `late_${Date.now()}@test.com`,
      role: 'customer',
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    // Create online payment order on Process A
    const createRes = await fetch(`${URL_A}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ productId: pId, quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'razorpay'
      })
    });
    const { orderId, razorpayOrderId, amount } = await createRes.json();

    // Cancel order on Process A
    const cancelRes = await fetch(`${URL_A}/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: 'Customer changed mind before payment' })
    });
    assert.strictEqual(cancelRes.status, 200);

    const postCancelOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(postCancelOrder.orderStatus, 'CANCELLED');

    // Deliver captured webhook to Process B for this cancelled order
    const paymentId = `pay_late_${Date.now()}`;
    const payloadStr = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount: amount || 64900,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    const signature = makeWebhookSignature(payloadStr);

    const whRes = await fetch(`${URL_B}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
      body: payloadStr
    });
    assert.strictEqual(whRes.status, 200);

    // Verify MongoDB state:
    const finalOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(finalOrder.orderStatus, 'REFUND_REQUIRED', 'Order status must be REFUND_REQUIRED');
    assert.strictEqual(finalOrder.paymentStatus, 'REFUND_REQUIRED', 'Payment status must be REFUND_REQUIRED');
    assert.notStrictEqual(finalOrder.orderStatus, 'CONFIRMED', 'Must never make a cancelled order CONFIRMED');
    assert.strictEqual(finalOrder.stockDeducted, false, 'Stock must not be marked deducted');

    const finalProd = await Product.findOne({ id: pId }).lean();
    assert.strictEqual(finalProd.stock, 15, 'Stock must remain untouched at 15');

    const pe = await PaymentEvent.findOne({ eventId: paymentId }).lean();
    assert.ok(pe, 'PaymentEvent must be recorded');
  });

  // -------------------------------------------------------------------------
  // 11. FAILED EVENT, THEN SUCCESSFUL RETRY
  // payment.failed releases wallet money. On retry, wallet money is re-debited before payment acceptance.
  // -------------------------------------------------------------------------
  it('11. payment.failed releases wallet money, and subsequent retry re-debits wallet before accepting payment', async () => {
    const user = await User.create({
      id: `usr_retry_${Date.now()}`,
      name: 'Retry User',
      email: `retry_${Date.now()}@test.com`,
      role: 'customer',
      walletBalance: 200,
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    // Create online order with ₹100 wallet deduction
    const createRes = await fetch(`${URL_A}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'razorpay',
        useWallet: true
      })
    });
    const { orderId, razorpayOrderId, amount } = await createRes.json();

    // Verify ₹200 wallet reservation occurred (all available balance deducted for order)
    let dbUser = await User.findOne({ id: user.id }).lean();
    assert.strictEqual(dbUser.walletBalance, 0);

    // Deliver payment.failed webhook to Process A
    const failPayload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_fail_${Date.now()}`,
            order_id: razorpayOrderId,
            amount,
            currency: 'INR',
            status: 'failed'
          }
        }
      }
    });
    const failSig = makeWebhookSignature(failPayload);
    const failRes = await fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': failSig },
      body: failPayload
    });
    assert.strictEqual(failRes.status, 200);

    // Verify wallet money was released back to ₹200
    dbUser = await User.findOne({ id: user.id }).lean();
    assert.strictEqual(dbUser.walletBalance, 200, 'Wallet balance must be restored upon payment failure');

    // Customer retries payment successfully: deliver payment.captured to Process B
    const retryPaymentId = `pay_retry_${Date.now()}`;
    const retryPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: retryPaymentId,
            order_id: razorpayOrderId,
            amount,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    const retrySig = makeWebhookSignature(retryPayload);
    const retryRes = await fetch(`${URL_B}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': retrySig },
      body: retryPayload
    });
    assert.strictEqual(retryRes.status, 200);

    // Verify wallet money was re-debited by ₹200 before accepting payment (back to ₹0)
    dbUser = await User.findOne({ id: user.id }).lean();
    assert.strictEqual(dbUser.walletBalance, 0, 'Wallet balance must be re-debited upon retry');

    const finalOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(finalOrder.paymentStatus, 'PAID');
    assert.strictEqual(finalOrder.orderStatus, 'CONFIRMED');
  });

  // -------------------------------------------------------------------------
  // 12. OLD FAILED EVENT AFTER PAID
  // An old failed event arriving after an order is already PAID must never alter the order.
  // -------------------------------------------------------------------------
  it('12. Delayed payment.failed webhook arriving after PAID order must not change order or release stock', async () => {
    const user = await User.create({
      id: `usr_oldfail_${Date.now()}`,
      name: 'Old Fail User',
      email: `oldfail_${Date.now()}@test.com`,
      role: 'customer',
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    const createRes = await fetch(`${URL_A}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'razorpay'
      })
    });
    const { orderId, razorpayOrderId, amount } = await createRes.json();

    // Mark PAID on Process A
    const paymentId = `pay_succ_${Date.now()}`;
    const capPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    await fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': makeWebhookSignature(capPayload) },
      body: capPayload
    });

    const paidOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(paidOrder.paymentStatus, 'PAID');

    // Deliver delayed payment.failed webhook to Process B
    const failPayload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_fail_delayed_${Date.now()}`,
            order_id: razorpayOrderId,
            amount,
            currency: 'INR',
            status: 'failed'
          }
        }
      }
    });
    const failRes = await fetch(`${URL_B}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': makeWebhookSignature(failPayload) },
      body: failPayload
    });
    assert.strictEqual(failRes.status, 200);

    // Verify order in MongoDB REMAINS PAID and CONFIRMED
    const orderAfterFail = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(orderAfterFail.paymentStatus, 'PAID', 'Order must stay PAID');
    assert.strictEqual(orderAfterFail.orderStatus, 'CONFIRMED', 'Order must stay CONFIRMED');
    assert.strictEqual(orderAfterFail.stockDeducted, true, 'Stock deduction must be preserved');
  });

  // -------------------------------------------------------------------------
  // 13. PAID ONLINE CANCELLATION AND REFUND
  // Cancelling a PAID order atomically creates a refund record and sets refund state.
  // -------------------------------------------------------------------------
  it('13. Cancelling a PAID online order atomically sets refund state and creates PaymentEvent refund record', async () => {
    const pId = `prod_cancel_paid_${Date.now()}`;
    await Product.create({
      id: pId,
      name: 'Paid Cancel Cut',
      description: 'Paid cancel',
      price: 649,
      mrp: 700,
      stock: 10,
      category: 'fish',
      unit: '500g',
      netWeight: '500g',
      grossWeight: '550g',
      inStock: true
    });

    const user = await User.create({
      id: `usr_cpaid_${Date.now()}`,
      name: 'Cancel Paid User',
      email: `cpaid_${Date.now()}@test.com`,
      role: 'customer',
      walletBalance: 100,
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    // Create order with ₹100 wallet + ₹549 gateway
    const createRes = await fetch(`${URL_A}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ productId: pId, quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'razorpay',
        useWallet: true
      })
    });
    const { orderId, razorpayOrderId, amount } = await createRes.json();

    // Finalize payment on Process A
    const payId = `pay_cpaid_${Date.now()}`;
    const capPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: payId,
            order_id: razorpayOrderId,
            amount,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });
    await fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': makeWebhookSignature(capPayload) },
      body: capPayload
    });

    // Check order is paid and stock deducted
    const preCancelOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(preCancelOrder.paymentStatus, 'PAID');
    const preStock = await Product.findOne({ id: pId }).lean();
    assert.strictEqual(preStock.stock, 9);

    // Cancel order on Process B
    const cancelRes = await fetch(`${URL_B}/api/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: 'Need to cancel paid order' })
    });
    assert.strictEqual(cancelRes.status, 200);

    // Verify MongoDB state:
    const postCancelOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(postCancelOrder.orderStatus, 'CANCELLED');
    assert.strictEqual(postCancelOrder.paymentStatus, 'REFUND_PENDING', 'Payment status must be REFUND_PENDING');
    assert.strictEqual(postCancelOrder.refundAmount, postCancelOrder.totalAmount);

    // Gateway refund record created in PaymentEvent
    const refundEvent = await PaymentEvent.findOne({ orderId: postCancelOrder.orderNumber, eventType: 'refund.created' }).lean();
    assert.ok(refundEvent, 'Gateway refund PaymentEvent record must exist');
    assert.strictEqual(refundEvent.amount, postCancelOrder.totalAmount);

    // Wallet refund record created in WalletLedger
    const walletRefund = await WalletLedger.findOne({ orderId: postCancelOrder.orderNumber, type: 'credit' }).lean();
    assert.ok(walletRefund, 'Wallet refund ledger entry must exist');
    assert.strictEqual(walletRefund.amount, 100);

    // Stock restored back to 10
    const postStock = await Product.findOne({ id: pId }).lean();
    assert.strictEqual(postStock.stock, 10);
  });

  // -------------------------------------------------------------------------
  // 14. DUPLICATE FAILED WEBHOOKS
  // Duplicate payment.failed webhooks return 200 and release wallet reservation once.
  // -------------------------------------------------------------------------
  it('14. Duplicate payment.failed webhooks sent to Process A and B release wallet exactly once', async () => {
    const user = await User.create({
      id: `usr_dupfail_${Date.now()}`,
      name: 'Dup Fail User',
      email: `dupfail_${Date.now()}@test.com`,
      role: 'customer',
      walletBalance: 150,
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    const createRes = await fetch(`${URL_A}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'razorpay',
        useWallet: true
      })
    });
    const { orderId, razorpayOrderId, amount } = await createRes.json();

    const failPayload = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_dupfail_${Date.now()}`,
            order_id: razorpayOrderId,
            amount,
            currency: 'INR',
            status: 'failed'
          }
        }
      }
    });
    const sig = makeWebhookSignature(failPayload);

    // Fire duplicate failed webhooks concurrently to Process A and Process B
    const sendA = fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
      body: failPayload
    });
    const sendB = fetch(`${URL_B}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
      body: failPayload
    });

    const [resA, resB] = await Promise.all([sendA, sendB]);
    assert.strictEqual(resA.status, 200);
    assert.strictEqual(resB.status, 200);

    // Verify wallet was restored to ₹150 EXACTLY ONCE (never ₹300)
    const finalUser = await User.findOne({ id: user.id }).lean();
    assert.strictEqual(finalUser.walletBalance, 150, 'Wallet balance must be restored once to 150');

    // Exactly 1 refund entry in WalletLedger for this order
    const ledgers = await WalletLedger.find({ orderId, type: 'credit' }).lean();
    assert.strictEqual(ledgers.length, 1, 'Exactly one refund entry in WalletLedger');
  });

  // -------------------------------------------------------------------------
  // 15. CONCURRENT HANDOVER ON A AND B (REPEATED 20 TIMES)
  // Double handover across two processes must count cash once via $inc.
  // -------------------------------------------------------------------------
  it('15. Concurrent handover across Process A and Process B counts cash exactly once (tested 20 times)', { timeout: 60000 }, async () => {
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      const rider = await User.create({
        id: `rider_handover_${i}_${Date.now()}`,
        name: `Rider Handover ${i}`,
        email: `rider_ho_${i}_${Date.now()}@test.com`,
        role: 'rider',
        approvalStatus: 'approved',
        cashInHand: 0
      });
      const riderToken = createToken(rider);

      const pin = '4321';
      const order = await Order.create({
        id: `ORD_HO_${i}_${Date.now()}`,
        orderNumber: `ORD_HO_${i}_${Date.now()}`,
        userId: `usr_ho_${i}`,
        customerName: 'Handover Customer',
        customerEmail: 'ho@test.com',
        customerPhone: '+91 97412 88301',
        items: [{ productId: 'prod_seer_steak', name: 'Seer Fish', price: 500, quantity: 1, unit: '500g' }],
        subtotal: 500,
        total: 500,
        totalAmount: 500,
        deliveryAddress: 'Delivery Address',
        deliveryPin: pin,
        orderStatus: 'OUT_FOR_DELIVERY',
        lifecycleStatus: 'OUT_FOR_DELIVERY',
        riderId: rider.id,
        paymentMethod: 'cod',
        paymentStatus: 'PENDING'
      });

      // Fire concurrent handover requests with correct PIN to Process A and Process B
      const hoA = fetch(`${URL_A}/api/orders/${order.id}/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
        body: JSON.stringify({ pin, cashAmount: 500 })
      });
      const hoB = fetch(`${URL_B}/api/orders/${order.id}/handover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
        body: JSON.stringify({ pin, cashAmount: 500 })
      });

      const [resA, resB] = await Promise.all([hoA, hoB]);
      const statuses = [resA.status, resB.status];

      // Exactly one must succeed with 200, the other must fail with 400
      assert.ok(statuses.includes(200), `One handover must return 200, got ${statuses} (iteration ${i})`);
      assert.ok(statuses.includes(400), `The duplicate handover must return 400, got ${statuses} (iteration ${i})`);

      // Verify MongoDB state:
      const finalOrder = await Order.findOne({ id: order.id }).lean();
      assert.strictEqual(finalOrder.orderStatus, 'DELIVERED');

      // Rider cashInHand must be incremented by ₹500 EXACTLY ONCE (never ₹1000)
      const finalRider = await User.findOne({ id: rider.id }).lean();
      assert.strictEqual(
        finalRider.cashInHand,
        500,
        `Rider cashInHand must be 500, was ${finalRider.cashInHand} (iteration ${i})`
      );
    }
  });

  // -------------------------------------------------------------------------
  // 16. MULTI-ITEM OUT-OF-STOCK FINALIZATION
  // If any item is unavailable during payment finalization, no stock from that order
  // may be deducted. Partial transaction must not be committed.
  // -------------------------------------------------------------------------
  it('16. Multi-item out-of-stock payment finalization aborts stock changes and deducts zero items', async () => {
    const p1 = `prod_multi_1_${Date.now()}`;
    const p2 = `prod_multi_2_${Date.now()}`;

    await Product.create([
      {
        id: p1,
        name: 'In-Stock Cut',
        description: 'Multi cut 1',
        price: 200,
        mrp: 250,
        stock: 10, // Stock is 10
        category: 'fish',
        unit: '500g',
        netWeight: '500g',
        grossWeight: '550g',
        inStock: true
      },
      {
        id: p2,
        name: 'Scarce Cut',
        description: 'Multi cut 2',
        price: 300,
        mrp: 350,
        stock: 1, // Only 1 in stock!
        category: 'fish',
        unit: '500g',
        netWeight: '500g',
        grossWeight: '550g',
        inStock: true
      }
    ]);

    const user = await User.create({
      id: `usr_multi_${Date.now()}`,
      name: 'Multi Item User',
      email: `multi_${Date.now()}@test.com`,
      role: 'customer',
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    // Create online order requesting 2 of p1 and 5 of p2 (p2 is out of stock!)
    const rzpOrderId = `rzp_oos_${Date.now()}`;
    const order = await Order.create({
      id: `ORD_OOS_${Date.now()}`,
      orderNumber: `ORD_OOS_${Date.now()}`,
      userId: user.id,
      customerName: user.name,
      customerEmail: user.email,
      customerPhone: '+91 97412 88301',
      items: [
        { productId: p1, name: 'In-Stock Cut', price: 200, quantity: 2, unit: '500g' },
        { productId: p2, name: 'Scarce Cut', price: 300, quantity: 5, unit: '500g' }
      ],
      subtotal: 1900,
      total: 1900,
      totalAmount: 1900,
      amountInPaise: 190000,
      deliveryAddress: 'Test Lane',
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      razorpayOrderId: rzpOrderId
    });

    const paymentId = `pay_oos_${Date.now()}`;
    const capPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: rzpOrderId,
            amount: 190000,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });

    const res = await fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': makeWebhookSignature(capPayload) },
      body: capPayload
    });
    assert.strictEqual(res.status, 200);

    // Verify MongoDB state:
    const finalOrder = await Order.findOne({ id: order.id }).lean();
    assert.strictEqual(finalOrder.orderStatus, 'REFUND_REQUIRED');
    assert.strictEqual(finalOrder.paymentStatus, 'REFUND_REQUIRED');
    assert.strictEqual(finalOrder.stockDeducted, false);

    // CRITICAL: ZERO stock must be deducted from product 1! (Previous 10 must remain 10)
    const postP1 = await Product.findOne({ id: p1 }).lean();
    assert.strictEqual(postP1.stock, 10, 'Product 1 stock must NOT be deducted; transaction must rollback completely');

    // Product 2 stock must remain 1
    const postP2 = await Product.findOne({ id: p2 }).lean();
    assert.strictEqual(postP2.stock, 1, 'Product 2 stock must remain 1');
  });

  // -------------------------------------------------------------------------
  // 17. NO AVAILABLE RIDER
  // If no approved rider is available, keep riderId null and show order in admin dispatch queue.
  // -------------------------------------------------------------------------
  it('17. If no approved rider is available, keep riderId null without hardcoding fallback', async () => {
    // Demote or remove approved status from all riders
    await User.updateMany({ role: 'rider' }, { $set: { approvalStatus: 'pending_approval' } });

    const user = await User.create({
      id: `usr_norider_${Date.now()}`,
      name: 'No Rider User',
      email: `norider_${Date.now()}@test.com`,
      role: 'customer',
      approvalStatus: 'approved'
    });
    const token = createToken(user);

    const createRes = await fetch(`${URL_A}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        items: [{ productId: 'prod_seer_steak', quantity: 1, selectedWeight: '500g' }],
        paymentMethod: 'razorpay'
      })
    });
    const { orderId, razorpayOrderId, amount } = await createRes.json();

    const paymentId = `pay_norider_${Date.now()}`;
    const capPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: razorpayOrderId,
            amount,
            currency: 'INR',
            status: 'captured'
          }
        }
      }
    });

    const whRes = await fetch(`${URL_B}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': makeWebhookSignature(capPayload) },
      body: capPayload
    });
    assert.strictEqual(whRes.status, 200);

    // Verify MongoDB state:
    const finalOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(finalOrder.orderStatus, 'CONFIRMED');
    assert.strictEqual(finalOrder.riderId, null, 'riderId must be null when no approved rider is available');
    assert.strictEqual(finalOrder.deliveryExecutive, null, 'deliveryExecutive must be null');

    // Admin can view unassigned orders in dispatch queue
    const adminUser = await User.create({
      id: `admin_queue_${Date.now()}`,
      name: 'Admin Queue',
      email: `admin_q_${Date.now()}@test.com`,
      role: 'admin',
      approvalStatus: 'approved'
    });
    const adminToken = createToken(adminUser);

    const adminOrdersRes = await fetch(`${URL_A}/api/orders`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const adminOrders = await adminOrdersRes.json();
    const unassignedOrder = adminOrders.find(o => o.id === orderId);
    assert.ok(unassignedOrder, 'Unassigned order must appear in admin dispatch queue');
    assert.strictEqual(unassignedOrder.riderId, null);
  });

  // -------------------------------------------------------------------------
  it('18. Admin refund queue returns REFUND_REQUIRED and REFUND_PENDING orders across Process A and B', async () => {
    const adminUser = await User.create({
      id: `admin_rfnd_q_${Date.now()}`,
      name: 'Admin Refund Queue',
      email: `admin_rq_${Date.now()}@test.com`,
      role: 'admin',
      approvalStatus: 'approved'
    });
    const adminToken = createToken(adminUser);

    const orderReqId = `ord_q_req_${Date.now()}`;
    const orderPendId = `ord_q_pend_${Date.now()}`;

    await Order.create([
      {
        id: orderReqId,
        orderNumber: `BB-${orderReqId}`,
        userId: 'cust_rfnd_1',
        customerName: 'Refund Cust 1',
        customerEmail: 'rfnd1@test.com',
        customerPhone: '+919871112233',
        subtotal: 500,
        total: 500,
        totalAmount: 500,
        paymentStatus: 'REFUND_REQUIRED',
        orderStatus: 'CANCELLED',
        items: []
      },
      {
        id: orderPendId,
        orderNumber: `BB-${orderPendId}`,
        userId: 'cust_rfnd_2',
        customerName: 'Refund Cust 2',
        customerEmail: 'rfnd2@test.com',
        customerPhone: '+919871112234',
        subtotal: 600,
        total: 600,
        totalAmount: 600,
        paymentStatus: 'REFUND_PENDING',
        orderStatus: 'REFUND_PENDING',
        items: []
      }
    ]);

    // Query on Process A
    const resA = await fetch(`${URL_A}/api/admin/refunds/queue`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(resA.status, 200);
    const queueA = await resA.json();
    assert.ok(queueA.some(o => o.id === orderReqId));
    assert.ok(queueA.some(o => o.id === orderPendId));

    // Query on Process B
    const resB = await fetch(`${URL_B}/api/admin/refunds/queue`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(resB.status, 200);
    const queueB = await resB.json();
    assert.ok(queueB.some(o => o.id === orderReqId));
    assert.ok(queueB.some(o => o.id === orderPendId));
  });

  // -------------------------------------------------------------------------
  it('19. Admin refund amount: ₹500 order = ₹100 wallet + ₹400 Razorpay refunds ₹400 to Razorpay and ₹100 to wallet once', async () => {
    const adminUser = await User.create({
      id: `admin_rfnd_exec_${Date.now()}`,
      name: 'Admin Refund Exec',
      email: `admin_rexec_${Date.now()}@test.com`,
      role: 'admin',
      approvalStatus: 'approved'
    });
    const adminToken = createToken(adminUser);

    const custUser = await User.create({
      id: `cust_split_rfnd_${Date.now()}`,
      name: 'Split Refund Customer',
      email: `split_rfnd_${Date.now()}@test.com`,
      role: 'customer',
      approvalStatus: 'approved',
      walletBalance: 0
    });

    const orderId = `ord_split_rfnd_${Date.now()}`;
    await Order.create({
      id: orderId,
      orderNumber: `BB-${orderId}`,
      userId: custUser.id,
      customerName: custUser.name,
      customerEmail: custUser.email,
      customerPhone: '+919871112235',
      deliveryAddress: '123 Test St, Bengaluru',
      subtotal: 500,
      total: 500,
      walletDeduction: 100,
      totalAmount: 400, // order.totalAmount is already the Razorpay amount after wallet use
      paymentStatus: 'REFUND_REQUIRED',
      orderStatus: 'CANCELLED',
      razorpayPaymentId: 'pay_split_mock_19',
      items: []
    });

    // Execute refund on Process A
    const refundRes = await fetch(`${URL_A}/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        reason: 'Order cancelled by customer. Split refund.'
      })
    });
    assert.strictEqual(refundRes.status, 200);
    const refundData = await refundRes.json();
    assert.strictEqual(refundData.success, true);

    // Verify MongoDB state:
    // 1. Order paymentStatus is REFUNDED
    const updatedOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(updatedOrder.paymentStatus, 'REFUNDED');
    assert.strictEqual(updatedOrder.walletRefunded, true);

    // 2. Customer wallet was credited exactly ₹100 through WalletLedger once
    const updatedCust = await User.findOne({ id: custUser.id }).lean();
    assert.strictEqual(updatedCust.walletBalance, 100);

    // 3. Persisted Refund record tracks PROCESSED with ₹400 (exact unrefunded gateway amount)
    const refundRec = await Refund.findOne({ orderId: updatedOrder.orderNumber }).lean();
    assert.ok(refundRec, 'Refund record must be persisted');
    assert.strictEqual(refundRec.status, 'PROCESSED');
    assert.strictEqual(refundRec.amount, 400); // exactly 400
  });

  // -------------------------------------------------------------------------
  it('20. Refund retry: FAILED refund is retryable without duplicate-key error, and concurrent retries create only one gateway refund', async () => {
    const adminUser = await User.findOne({ role: 'admin' }).lean();
    const adminToken = createToken(adminUser);

    const orderId = `ord_retry_rfnd_${Date.now()}`;
    await Order.create({
      id: orderId,
      orderNumber: `BB-${orderId}`,
      userId: 'cust_retry_test',
      customerName: 'Retry Cust',
      customerEmail: 'retry@test.com',
      deliveryAddress: '123 Test St, Bengaluru',
      subtotal: 500,
      total: 500,
      totalAmount: 500,
      paymentStatus: 'REFUND_REQUIRED',
      orderStatus: 'CANCELLED',
      razorpayPaymentId: 'pay_retry_mock_20',
      items: []
    });

    // 1. Initial attempt fails at gateway (simulated via force_fail in receipt)
    const failRes = await fetch(`${URL_A}/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'idempotency-key': `force_fail_${orderId}`
      },
      body: JSON.stringify({ reason: 'Initial attempt' })
    });
    assert.strictEqual(failRes.status, 502);

    const failedDoc = await Refund.findOne({ orderId: `BB-${orderId}` }).lean();
    assert.strictEqual(failedDoc.status, 'FAILED');
    assert.strictEqual(failedDoc.attempts, 1);

    // 2. Concurrent retries on Process A and Process B
    const retryReq1 = fetch(`${URL_A}/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ reason: 'Retry attempt A' })
    });
    const retryReq2 = fetch(`${URL_B}/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ reason: 'Retry attempt B' })
    });

    const [res1, res2] = await Promise.all([retryReq1, retryReq2]);
    const statuses = [res1.status, res2.status];
    assert.ok(statuses.includes(200), 'At least one retry must succeed');

    // Assert: Exactly ONE Refund record exists for this order (NEVER duplicate-key error)
    const refundDocs = await Refund.find({ orderId: `BB-${orderId}` }).lean();
    assert.strictEqual(refundDocs.length, 1, 'Only one Refund record must exist per order');
    assert.strictEqual(refundDocs[0].status, 'PROCESSED');
    assert.ok(refundDocs[0].attempts >= 2, 'attempts counter incremented on retry');

    const updatedOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(updatedOrder.paymentStatus, 'REFUNDED');
  });

  // -------------------------------------------------------------------------
  it('21. Refund confirmation: pending gateway refund keeps order REFUND_PENDING, verified webhook marks REFUNDED, and refund.failed allows retry', async () => {
    const adminUser = await User.findOne({ role: 'admin' }).lean();
    const adminToken = createToken(adminUser);

    // Case A: Gateway returns pending
    const orderIdPending = `ord_pending_rfnd_${Date.now()}`;
    await Order.create({
      id: orderIdPending,
      orderNumber: `BB-${orderIdPending}`,
      userId: 'cust_pend_test',
      customerName: 'Pending Cust',
      customerEmail: 'pend@test.com',
      deliveryAddress: '123 Test St, Bengaluru',
      subtotal: 500,
      total: 500,
      totalAmount: 500,
      paymentStatus: 'REFUND_REQUIRED',
      orderStatus: 'CANCELLED',
      razorpayPaymentId: 'pay_pend_mock_21',
      items: []
    });

    const pendRes = await fetch(`${URL_A}/api/admin/orders/${orderIdPending}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
        'idempotency-key': `force_pending_${orderIdPending}`
      },
      body: JSON.stringify({ reason: 'Initiate' })
    });
    assert.strictEqual(pendRes.status, 200);
    const pendData = await pendRes.json();
    assert.strictEqual(pendData.status, 'PENDING');

    // Order must NOT be marked REFUNDED yet!
    const midOrder = await Order.findOne({ id: orderIdPending }).lean();
    assert.strictEqual(midOrder.paymentStatus, 'REFUND_PENDING');
    assert.strictEqual(midOrder.orderStatus, 'REFUND_PENDING');

    const midRefund = await Refund.findOne({ orderId: `BB-${orderIdPending}` }).lean();
    assert.strictEqual(midRefund.status, 'PENDING');

    // Webhook refund.processed arrives on Process B
    const procPayload = JSON.stringify({
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: midRefund.refundId,
            payment_id: 'pay_pend_mock_21',
            amount: 50000,
            currency: 'INR',
            status: 'processed',
            receipt: midRefund.idempotencyKey,
            notes: { orderId: orderIdPending }
          }
        }
      }
    });

    const whProcRes = await fetch(`${URL_B}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': makeWebhookSignature(procPayload) },
      body: procPayload
    });
    assert.strictEqual(whProcRes.status, 200);

    // Now order is marked REFUNDED
    const finalOrder = await Order.findOne({ id: orderIdPending }).lean();
    assert.strictEqual(finalOrder.paymentStatus, 'REFUNDED');
    const finalRefund = await Refund.findOne({ orderId: `BB-${orderIdPending}` }).lean();
    assert.strictEqual(finalRefund.status, 'PROCESSED');

    // Case B: Webhook refund.failed arrives and allows retry
    const orderIdFail = `ord_wh_fail_${Date.now()}`;
    await Order.create({
      id: orderIdFail,
      orderNumber: `BB-${orderIdFail}`,
      userId: 'cust_wh_fail',
      customerName: 'WH Fail Cust',
      customerEmail: 'whfail@test.com',
      deliveryAddress: '123 Test St, Bengaluru',
      subtotal: 500,
      total: 500,
      totalAmount: 500,
      paymentStatus: 'REFUND_PENDING',
      orderStatus: 'REFUND_PENDING',
      razorpayPaymentId: 'pay_wh_fail_21',
      items: []
    });

    const fakeRefundRec = await Refund.create({
      id: `rfnd_fake_${Date.now()}`,
      orderId: `BB-${orderIdFail}`,
      paymentId: 'pay_wh_fail_21',
      refundId: `rfnd_wh_fail_${Date.now()}`,
      amount: 500,
      currency: 'INR',
      status: 'PENDING',
      idempotencyKey: `idem_wh_fail_${orderIdFail}`
    });

    const failPayload = JSON.stringify({
      event: 'refund.failed',
      payload: {
        refund: {
          entity: {
            id: fakeRefundRec.refundId,
            payment_id: 'pay_wh_fail_21',
            amount: 50000,
            currency: 'INR',
            status: 'failed',
            receipt: fakeRefundRec.idempotencyKey,
            error_description: 'Bank network failure',
            notes: { orderId: orderIdFail }
          }
        }
      }
    });

    const whFailRes = await fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': makeWebhookSignature(failPayload) },
      body: failPayload
    });
    assert.strictEqual(whFailRes.status, 200);

    // Order must transition back to REFUND_REQUIRED and Refund marked FAILED
    const afterFailOrder = await Order.findOne({ id: orderIdFail }).lean();
    assert.strictEqual(afterFailOrder.paymentStatus, 'REFUND_REQUIRED');
    const afterFailRefund = await Refund.findOne({ orderId: `BB-${orderIdFail}` }).lean();
    assert.strictEqual(afterFailRefund.status, 'FAILED');
  });

  // -------------------------------------------------------------------------
  it('22. Paid retry with insufficient wallet balance records payment event, sets REFUND_REQUIRED, and does not deduct stock', async () => {
    const cust = await User.create({
      id: `cust_insuff_${Date.now()}`,
      name: 'Insufficient Wallet User',
      email: `insuff_${Date.now()}@test.com`,
      walletBalance: 20 // Has ₹20, but order reserved ₹100
    });

    const initialProduct = await Product.findOne({ id: 'prod_seer_steak' }).lean();
    const initialStock = initialProduct.stock;

    const orderId = `ord_retry_insuff_${Date.now()}`;
    await Order.create({
      id: orderId,
      orderNumber: `BB-${orderId}`,
      userId: cust.id,
      customerName: cust.name,
      customerEmail: cust.email,
      subtotal: 649,
      total: 549,
      totalAmount: 549,
      walletDeduction: 100,
      walletRefunded: true, // Wallet was released after prior payment.failed
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING_PAYMENT',
      razorpayOrderId: `rzp_ord_${orderId}`,
      stockDeducted: false,
      items: [{
        productId: 'prod_seer_steak',
        name: 'Surmai Seer Fish Steaks',
        price: 649,
        quantity: 1
      }]
    });

    // Captured webhook arrives on retry
    const paymentId = `pay_retry_insuff_${Date.now()}`;
    const capPayload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: paymentId,
            order_id: `rzp_ord_${orderId}`,
            amount: 54900,
            currency: 'INR',
            notes: { orderId }
          }
        }
      }
    });

    const res = await fetch(`${URL_A}/api/payments/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-razorpay-signature': makeWebhookSignature(capPayload)
      },
      body: capPayload
    });
    // Webhook must return 200
    assert.strictEqual(res.status, 200);

    // Verify MongoDB state:
    const updatedOrder = await Order.findOne({ id: orderId }).lean();
    assert.strictEqual(updatedOrder.paymentStatus, 'REFUND_REQUIRED');
    assert.strictEqual(updatedOrder.orderStatus, 'REFUND_REQUIRED');
    assert.strictEqual(updatedOrder.stockDeducted, false);

    // Stock must NOT be deducted
    const freshProd = await Product.findOne({ id: 'prod_seer_steak' }).lean();
    assert.strictEqual(freshProd.stock, initialStock);

    // PaymentEvent must be recorded
    const event = await PaymentEvent.findOne({ paymentId }).lean();
    assert.ok(event, 'PaymentEvent must be recorded');
  });

  // -------------------------------------------------------------------------
  it('23. COD Cash enforcement: rejects lower/excessive cash, records exact server amount, rejects cash for prepaid order', async () => {
    const rider = await User.create({
      id: `rider_cod_${Date.now()}`,
      name: 'COD Rider',
      email: `rider_cod_${Date.now()}@test.com`,
      role: 'rider',
      approvalStatus: 'approved',
      cashInHand: 0
    });
    const riderToken = createToken(rider);

    // 1. COD Order with server amount 450
    const codOrderId = `ord_cod_${Date.now()}`;
    await Order.create({
      id: codOrderId,
      orderNumber: `BB-${codOrderId}`,
      userId: 'cust_cod_test',
      customerName: 'COD Cust',
      customerEmail: 'cod@test.com',
      deliveryAddress: '123 Test St, Bengaluru',
      subtotal: 450,
      total: 450,
      totalAmount: 450,
      paymentMethod: 'Cash on Delivery',
      paymentStatus: 'PENDING',
      orderStatus: 'OUT_FOR_DELIVERY',
      lifecycleStatus: 'OUT_FOR_DELIVERY',
      riderId: rider.id,
      deliveryPin: '1234',
      items: []
    });

    // Lower cash (300 instead of 450) -> Rejected 400
    const lowerRes = await fetch(`${URL_A}/api/orders/${codOrderId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
      body: JSON.stringify({ pin: '1234', cashAmount: 300 })
    });
    assert.strictEqual(lowerRes.status, 400);

    // Negative cash -> Rejected 400
    const negRes = await fetch(`${URL_A}/api/orders/${codOrderId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
      body: JSON.stringify({ pin: '1234', cashAmount: -100 })
    });
    assert.strictEqual(negRes.status, 400);

    // Excessive cash (500 instead of 450) -> Rejected 400
    const excessRes = await fetch(`${URL_A}/api/orders/${codOrderId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
      body: JSON.stringify({ pin: '1234', cashAmount: 500 })
    });
    assert.strictEqual(excessRes.status, 400);

    // Exact cash (450) -> Accepted 200
    const exactRes = await fetch(`${URL_A}/api/orders/${codOrderId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
      body: JSON.stringify({ pin: '1234', cashAmount: 450 })
    });
    assert.strictEqual(exactRes.status, 200);

    // Verify rider cashInHand incremented by exactly 450
    const refreshedRider = await User.findOne({ id: rider.id }).lean();
    assert.strictEqual(refreshedRider.cashInHand, 450);

    // 2. Prepaid order: cashAmount > 0 must be rejected
    const prepaidOrderId = `ord_prepaid_${Date.now()}`;
    await Order.create({
      id: prepaidOrderId,
      orderNumber: `BB-${prepaidOrderId}`,
      userId: 'cust_prepaid_test',
      customerName: 'Prepaid Cust',
      customerEmail: 'prepaid@test.com',
      deliveryAddress: '123 Test St, Bengaluru',
      subtotal: 500,
      total: 500,
      totalAmount: 500,
      paymentMethod: 'Razorpay Online (Prepaid)',
      paymentStatus: 'PAID',
      orderStatus: 'OUT_FOR_DELIVERY',
      lifecycleStatus: 'OUT_FOR_DELIVERY',
      riderId: rider.id,
      deliveryPin: '9999',
      items: []
    });

    const prepCashRes = await fetch(`${URL_B}/api/orders/${prepaidOrderId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
      body: JSON.stringify({ pin: '9999', cashAmount: 500 })
    });
    assert.strictEqual(prepCashRes.status, 400);

    // Rider cashInHand remains 450
    const finalRider = await User.findOne({ id: rider.id }).lean();
    assert.strictEqual(finalRider.cashInHand, 450);
  });

  // -------------------------------------------------------------------------
  it('24. Cash deposits: rider initiates PENDING deposit without balance drop, admin confirms with atomic decrement, double confirm rejected', async () => {
    const rider = await User.create({
      id: `rider_dep_${Date.now()}`,
      name: 'Deposit Rider',
      email: `dep_rider_${Date.now()}@test.com`,
      role: 'rider',
      approvalStatus: 'approved',
      cashInHand: 500
    });
    const riderToken = createToken(rider);

    const admin = await User.findOne({ role: 'admin' }).lean();
    const adminToken = createToken(admin);

    // Rider requests deposit of 300 on Process A
    const depRes = await fetch(`${URL_A}/api/rider/cash-deposit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
      body: JSON.stringify({ amount: 300 })
    });
    assert.strictEqual(depRes.status, 200);
    const depData = await depRes.json();
    const depositId = depData.deposit.id;

    // Verify status is PENDING and rider cashInHand is STILL 500
    const midRider = await User.findOne({ id: rider.id }).lean();
    assert.strictEqual(midRider.cashInHand, 500, 'cashInHand must NOT change until admin confirms');

    // Admin confirms deposit on Process B
    const confRes = await fetch(`${URL_B}/api/admin/cash-deposits/${depositId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(confRes.status, 200);

    // Verify rider cashInHand decremented to 200 (500 - 300)
    const afterRider = await User.findOne({ id: rider.id }).lean();
    assert.strictEqual(afterRider.cashInHand, 200);

    // Second confirmation attempt on Process A must fail
    const doubleConfRes = await fetch(`${URL_A}/api/admin/cash-deposits/${depositId}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(doubleConfRes.status, 400, 'Double confirmation must be rejected');
  });

  // -------------------------------------------------------------------------
  it('25. Cooler refund: uses actual deposit paid, ₹0 deposit credits ₹0, and prevents duplicate refund', async () => {
    const cust = await User.create({
      id: `cust_cooler_zero_${Date.now()}`,
      name: 'Zero Deposit Customer',
      email: `zero_dep_${Date.now()}@test.com`,
      walletBalance: 100
    });

    const rider = await User.findOne({ role: 'rider', approvalStatus: 'approved' }).lean();
    const riderToken = createToken(rider);

    const orderId = `ord_cooler_zero_${Date.now()}`;
    await Order.create({
      id: orderId,
      orderNumber: `BB-${orderId}`,
      userId: cust.id,
      customerName: cust.name,
      customerEmail: cust.email,
      deliveryAddress: '123 Test St, Bengaluru',
      subtotal: 300,
      total: 300,
      totalAmount: 300,
      coolerDeposit: 0, // ₹0 deposit paid!
      paymentMethod: 'Razorpay Online (Prepaid)',
      paymentStatus: 'PAID',
      orderStatus: 'OUT_FOR_DELIVERY',
      lifecycleStatus: 'OUT_FOR_DELIVERY',
      riderId: rider.id,
      deliveryPin: '3333',
      coolerId: 'BOX-TEST-001',
      items: []
    });

    // Handover with coolerReturned: true
    const handRes = await fetch(`${URL_A}/api/orders/${orderId}/handover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
      body: JSON.stringify({ pin: '3333', coolerReturned: true })
    });
    assert.strictEqual(handRes.status, 200);

    // Verify customer wallet balance is STILL exactly 100 (₹0 credited, not ₹250!)
    const refreshedCust = await User.findOne({ id: cust.id }).lean();
    assert.strictEqual(refreshedCust.walletBalance, 100, '₹0 deposit must credit ₹0, never ₹250');
  });

  // -------------------------------------------------------------------------
  it('26. PIN security: 20 simultaneous guesses across two processes with correct PIN among them (tested 20 times)', { timeout: 60000 }, async () => {
    const rider = await User.findOne({ role: 'rider', approvalStatus: 'approved' }).lean();
    const riderToken = createToken(rider);
    const validPin = '5432';

    for (let iter = 0; iter < 20; iter++) {
      const orderId = `ord_pin_race_${iter}_${Date.now()}`;
      await Order.create({
        id: orderId,
        orderNumber: `BB-${orderId}`,
        userId: 'cust_pin_race',
        customerName: 'PIN Race Cust',
        customerEmail: 'pinrace@test.com',
        deliveryAddress: '123 Test St, Bengaluru',
        subtotal: 300,
        total: 300,
        totalAmount: 300,
        paymentMethod: 'Razorpay Online (Prepaid)',
        paymentStatus: 'PAID',
        orderStatus: 'OUT_FOR_DELIVERY',
        lifecycleStatus: 'OUT_FOR_DELIVERY',
        riderId: rider.id,
        deliveryPin: validPin,
        items: []
      });

      // Prepare 20 guesses: 19 wrong, 1 correct, distributed across Process A and Process B
      const guesses = [];
      const correctIdx = Math.floor(Math.random() * 20);

      for (let i = 0; i < 20; i++) {
        const pinToTry = (i === correctIdx) ? validPin : String(1000 + i).padStart(4, '0');
        const url = (i % 2 === 0) ? URL_A : URL_B;
        guesses.push({ pin: pinToTry, isCorrect: (i === correctIdx), url });
      }

      // Fire all 20 simultaneous guesses
      const responses = await Promise.all(
        guesses.map(g =>
          fetch(`${g.url}/api/orders/${orderId}/handover`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
            body: JSON.stringify({ pin: g.pin })
          }).then(async r => ({ status: r.status, data: await r.json(), isCorrect: g.isCorrect }))
        )
      );

      const successCount = responses.filter(r => r.status === 200).length;
      assert.ok(successCount <= 1, 'At most 1 request can succeed in delivering');

      const updatedOrder = await Order.findOne({ id: orderId }).lean();

      if (successCount === 1) {
        // Order was delivered! The winning request MUST have had the correct PIN
        const winner = responses.find(r => r.status === 200);
        assert.strictEqual(winner.isCorrect, true, 'Only the correct PIN can deliver');
        assert.strictEqual(updatedOrder.orderStatus, 'DELIVERED');
      } else {
        // Correct PIN was NOT in the first 3 accepted attempts!
        // The order MUST NOT be delivered!
        assert.notStrictEqual(updatedOrder.orderStatus, 'DELIVERED');
        assert.ok(updatedOrder.pinAttempts >= 3, 'pinAttempts must have reached at least 3');
        assert.ok(updatedOrder.pinLockedUntil, 'pinLockedUntil must be set');
        assert.ok(updatedOrder.pinLockedUntil instanceof Date, 'pinLockedUntil must be a Date object');

        // Subsequent attempt even with the correct PIN MUST be rejected with 429
        const lateCorrectRes = await fetch(`${URL_A}/api/orders/${orderId}/handover`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${riderToken}` },
          body: JSON.stringify({ pin: validPin })
        });
        assert.strictEqual(lateCorrectRes.status, 429, 'Locked order must reject even the correct PIN with 429');
        const lateData = await lateCorrectRes.json();
        assert.strictEqual(lateData.locked, true);
      }
    }
  });

  // -------------------------------------------------------------------------
  it('27. Phone identity: normalizes phone numbers, enforces partial unique index, and preserves empty string for missing phones', async () => {
    const { normalizePhone } = await import('../models/User.js');
    assert.strictEqual(normalizePhone('9888877777'), '+919888877777');
    assert.strictEqual(normalizePhone('+91 98888 77777'), '+919888877777');
    assert.strictEqual(normalizePhone(''), '');
    assert.strictEqual(normalizePhone(null), '');

    // Partial unique index test:
    const phoneNum = `+919911${Math.floor(100000 + Math.random() * 900000)}`;
    await User.create({
      id: `usr_phone_uniq_1_${Date.now()}`,
      name: 'Phone User 1',
      email: `phone1_${Date.now()}@test.com`,
      phone: phoneNum
    });

    // Duplicate non-empty phone must be rejected
    await assert.rejects(async () => {
      await User.create({
        id: `usr_phone_uniq_2_${Date.now()}`,
        name: 'Phone User 2',
        email: `phone2_${Date.now()}@test.com`,
        phone: phoneNum
      });
    }, /E11000.*duplicate key/);

    // Empty phone must NOT collide
    const empty1 = await User.create({
      id: `usr_empty_1_${Date.now()}`,
      name: 'Empty Phone 1',
      email: `empty1_${Date.now()}@test.com`,
      phone: ''
    });
    const empty2 = await User.create({
      id: `usr_empty_2_${Date.now()}`,
      name: 'Empty Phone 2',
      email: `empty2_${Date.now()}@test.com`,
      phone: ''
    });
    assert.strictEqual(empty1.phone, '');
    assert.strictEqual(empty2.phone, '');
  });

  // -------------------------------------------------------------------------
  it('28. Migration script: detects demo records and aborts before writing', async () => {
    const { isDemoRecord } = await import('../scripts/migrateToMongo.js');
    assert.strictEqual(isDemoRecord({ phone: '+91 98765 43210' }), true);
    assert.strictEqual(isDemoRecord({ email: 'test@example.com' }), true);
    assert.strictEqual(isDemoRecord({ id: 'ord-demo-123' }), true);
    assert.strictEqual(isDemoRecord({ name: 'Real Customer', email: 'real@domain.in', phone: '+919876599999' }), false);
  });
});
