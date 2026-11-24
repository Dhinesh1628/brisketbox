import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';

const binaryPath = 'C:\\Users\\dines\\.cache\\mongodb-binaries\\mongod-x64-win32-5.0.19.exe';
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
      binary: { systemBinary: binaryPath }
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

    console.log('[Test Setup] Spawning Node Process A on port', PORT_A);
    procA = spawn(process.execPath, [serverPath], { cwd: backendCwd, env: envA, stdio: ['ignore', 'pipe', 'pipe'] });
    procA.stdout.on('data', d => console.log('[Proc A stdout]', d.toString().trim()));
    procA.stderr.on('data', d => console.error('[Proc A stderr]', d.toString().trim()));
    procA.on('exit', (code, sig) => console.log('[Proc A exited with code]', code, sig));

    console.log('[Test Setup] Spawning Node Process B on port', PORT_B);
    procB = spawn(process.execPath, [serverPath], { cwd: backendCwd, env: envB, stdio: ['ignore', 'pipe', 'pipe'] });
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
});
