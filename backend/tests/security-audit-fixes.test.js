import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test_jwt_secret_audit_hardening_key_32bytes_long!';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_key_12345';
process.env.RAZORPAY_KEY_ID = 'rzp_test_placeholder';
process.env.RAZORPAY_KEY_SECRET = 'test_secret_placeholder';

let server;
let baseUrl;

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function request(path, options = {}) {
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

describe('Security Audit & Production Hardening Test Suite', () => {
  let customerUser;
  let otherCustomerUser;
  let riderUser;
  let adminUser;
  let customerToken;
  let otherCustomerToken;
  let riderToken;
  let adminToken;
  let testProduct;

  before(async () => {
    const serverModule = await import('../server.js');
    const app = serverModule.default;
    
    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const runId = Date.now().toString(36);

    // Seed test records
    customerUser = {
      id: `cust_audit_${runId}`,
      name: 'Audit Customer',
      email: `audit.cust.${runId}@example.com`,
      role: 'customer',
      walletBalance: 500,
      walletTransactions: []
    };
    otherCustomerUser = {
      id: `cust_other_${runId}`,
      name: 'Other Customer',
      email: `other.cust.${runId}@example.com`,
      role: 'customer',
      walletBalance: 0,
      walletTransactions: []
    };
    riderUser = {
      id: `rider_audit_${runId}`,
      name: 'Fleet Rider',
      email: `rider.audit.${runId}@example.com`,
      role: 'rider',
      approvalStatus: 'approved'
    };
    adminUser = {
      id: `admin_audit_${runId}`,
      name: 'Ops Admin',
      email: `admin.audit.${runId}@example.com`,
      role: 'admin'
    };

    db.insert('users', customerUser);
    db.insert('users', otherCustomerUser);
    db.insert('users', riderUser);
    db.insert('users', adminUser);

    testProduct = {
      id: `prod_audit_${runId}`,
      name: 'Prime Mutton Cut',
      category: 'Mutton',
      price: 450,
      stock: 10
    };
    db.insert('products', testProduct);

    customerToken = makeToken(customerUser);
    otherCustomerToken = makeToken(otherCustomerUser);
    riderToken = makeToken(riderUser);
    adminToken = makeToken(adminUser);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      db.delete('users', customerUser.id);
      db.delete('users', otherCustomerUser.id);
      db.delete('users', riderUser.id);
      db.delete('users', adminUser.id);
      db.delete('products', testProduct.id);
    } catch (e) {}
  });

  it('1. Server starts cleanly and health check responds 200', async () => {
    const res = await request('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.data.status, 'ok');
  });

  it('2. /simulate-temp is removed (404) and staff /temperature records real readings without leaking deliveryPin', async () => {
    const testOrder = {
      id: `ORD-TEMP-${Date.now()}`,
      userId: customerUser.id,
      deliveryPin: '7891',
      liveTemp: null,
      tempLog: [],
      orderStatus: 'OUT_FOR_DELIVERY'
    };
    db.insert('orders', testOrder);

    // /simulate-temp is completely removed -> 404
    const simRes = await request(`/api/orders/${testOrder.id}/simulate-temp`, { method: 'POST' });
    assert.equal(simRes.status, 404);

    // Customer attempting to record staff check -> 403
    const forbidden = await request(`/api/orders/${testOrder.id}/temperature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp: 2.1 })
    });
    assert.equal(forbidden.status, 403);

    // Invalid temperature reading -> 400
    const badTemp = await request(`/api/orders/${testOrder.id}/temperature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp: 'invalid_number' })
    });
    assert.equal(badTemp.status, 400);

    // Authorized Admin recording staff check -> 200, updates liveTemp & tempLog with audit info
    const allowed = await request(`/api/orders/${testOrder.id}/temperature`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ temp: 2.4, event: 'Depot dispatch sensor reading' })
    });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.data.success, true);
    assert.equal(allowed.data.liveTemp, 2.4);
    assert.equal(allowed.data.recordedEntry.source, 'STAFF_CHECK');
    assert.equal(allowed.data.recordedEntry.recordedBy, adminUser.name);
    assert.equal(allowed.data.deliveryPin, undefined);

    db.delete('orders', testOrder.id);
  });

  it('3. /api/payments/verify enforces authentication and ownership', async () => {
    const order = {
      id: `ORD-VERIFY-${Date.now()}`,
      razorpayOrderId: `rzp_ord_${Date.now()}`,
      userId: customerUser.id,
      deliveryPin: '4321',
      totalAmount: 450,
      amountInPaise: 45000,
      paymentStatus: 'PAID',
      orderStatus: 'CONFIRMED'
    };
    db.insert('orders', order);

    // Unauthenticated -> 401
    const unauth = await request('/api/payments/verify', {
      method: 'POST',
      body: { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_123' }
    });
    assert.equal(unauth.status, 401);

    // Mismatched customer -> 403
    const forbidden = await request('/api/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${otherCustomerToken}` },
      body: { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_123' }
    });
    assert.equal(forbidden.status, 403);

    // Owning customer -> 200, deliveryPin is present for owner
    const ownerRes = await request('/api/payments/verify', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: { razorpay_order_id: order.razorpayOrderId, razorpay_payment_id: 'pay_123' }
    });
    assert.equal(ownerRes.status, 200);
    assert.equal(ownerRes.data.order.id, order.id);

    db.delete('orders', order.id);
  });

  it('4. Status tampering to DELIVERED is rejected and requires PIN handover', async () => {
    const order = {
      id: `ORD-TAMPER-${Date.now()}`,
      userId: customerUser.id,
      riderId: riderUser.id,
      deliveryPin: '9999',
      orderStatus: 'OUT_FOR_DELIVERY',
      status: 'Out for Delivery'
    };
    db.insert('orders', order);

    // Arbitrary customer cannot update status
    const custTamper = await request(`/api/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${otherCustomerToken}` },
      body: { orderStatus: 'PACKED' }
    });
    assert.equal(custTamper.status, 403);

    // Rider cannot jump directly to DELIVERED via status route
    const directDeliver = await request(`/api/orders/${order.id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: { orderStatus: 'DELIVERED' }
    });
    assert.equal(directDeliver.status, 400);
    assert.match(directDeliver.data.error, /handover/i);

    db.delete('orders', order.id);
  });

  it('5. Handover is idempotent and deposit refund occurs only if deposit was paid', async () => {
    const order = {
      id: `ORD-HANDOVER-${Date.now()}`,
      userId: customerUser.id,
      riderId: riderUser.id,
      deliveryPin: '5555',
      orderStatus: 'OUT_FOR_DELIVERY',
      coolerDeposit: 0, // ₹0 deposit
      coolerDepositRefunded: false,
      coolerReturned: false
    };
    db.insert('orders', order);

    const userBefore = db.findById('users', customerUser.id);
    const balanceBefore = userBefore.walletBalance;

    // Handover with PIN
    const handoverRes = await request(`/api/orders/${order.id}/handover`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: { pin: '5555', coolerReturned: true }
    });
    assert.equal(handoverRes.status, 200);

    // Wallet balance should NOT increase because deposit was ₹0
    const userAfter = db.findById('users', customerUser.id);
    assert.equal(userAfter.walletBalance, balanceBefore);

    // Calling handover again on already DELIVERED order -> 400
    const repeatRes = await request(`/api/orders/${order.id}/handover`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${riderToken}` },
      body: { pin: '5555', coolerReturned: true }
    });
    assert.equal(repeatRes.status, 400);
    assert.match(repeatRes.data.error, /already been delivered/i);

    db.delete('orders', order.id);
  });

  it('6. Webhook verifies signature, currency, and exact amount', async () => {
    const order = {
      id: `ORD-WEBHOOK-${Date.now()}`,
      orderNumber: `BB-TEST-${Date.now()}`,
      razorpayOrderId: `order_wh_${Date.now()}`,
      userId: customerUser.id,
      totalAmount: 450,
      amountInPaise: 45000,
      paymentStatus: 'PENDING',
      orderStatus: 'PENDING_PAYMENT',
      stockDeducted: false,
      items: [{ productId: testProduct.id, quantity: 1 }]
    };
    db.insert('orders', order);

    // Fake payment with 1 paisa (Attack!)
    const badAmountPayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_bad_amt_1',
            order_id: order.razorpayOrderId,
            amount: 1, // Attacker paid 1 paisa instead of 45000 paise!
            currency: 'INR'
          }
        }
      }
    };

    const rawBadBody = JSON.stringify(badAmountPayload);
    const badSig = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBadBody)
      .digest('hex');

    const rejectRes = await request('/api/payments/webhook', {
      method: 'POST',
      headers: { 'x-razorpay-signature': badSig },
      body: rawBadBody
    });

    assert.equal(rejectRes.status, 400);
    assert.match(rejectRes.data.error, /mismatch/i);

    // Order should NOT be confirmed
    const updatedOrder = db.findById('orders', order.id);
    assert.equal(updatedOrder.paymentStatus, 'FAILED');

    db.delete('orders', order.id);
  });

  it('7. Cancel unpaid order does not restore stock; cancel wallet order refunds credit', async () => {
    const prodBefore = db.findById('products', testProduct.id);
    const stockBefore = prodBefore.stock;

    // Unpaid order with stockDeducted: false
    const unpaidOrder = {
      id: `ORD-CANCEL-UNPAID-${Date.now()}`,
      userId: customerUser.id,
      orderStatus: 'PENDING_PAYMENT',
      stockDeducted: false,
      items: [{ productId: testProduct.id, quantity: 2 }]
    };
    db.insert('orders', unpaidOrder);

    const cancelRes = await request(`/api/orders/${unpaidOrder.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.equal(cancelRes.status, 200);

    // Stock must remain unchanged
    const prodAfter = db.findById('products', testProduct.id);
    assert.equal(prodAfter.stock, stockBefore);

    // Paid with wallet order
    const user = db.findById('users', customerUser.id);
    const walletBefore = user.walletBalance;

    const walletOrder = {
      id: `ORD-CANCEL-WALLET-${Date.now()}`,
      userId: customerUser.id,
      orderStatus: 'CONFIRMED',
      paymentStatus: 'PAID',
      walletDeduction: 150,
      stockDeducted: true,
      items: [{ productId: testProduct.id, quantity: 1 }]
    };
    db.insert('orders', walletOrder);

    const cancelWalletRes = await request(`/api/orders/${walletOrder.id}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` }
    });
    assert.equal(cancelWalletRes.status, 200);

    // Wallet must be refunded
    const userAfter = db.findById('users', customerUser.id);
    assert.equal(userAfter.walletBalance, walletBefore + 150);

    db.delete('orders', unpaidOrder.id);
    db.delete('orders', walletOrder.id);
  });

  it('8. Guest abuse is blocked: COD requires login and single-use coupon requires login', async () => {
    // Guest COD order attempt
    const codRes = await request('/api/payments/create-order', {
      method: 'POST',
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        paymentMethod: 'cod',
        addressDetails: { fullName: 'Guest User', phone: '+91 99999 11111' }
      }
    });
    assert.equal(codRes.status, 401);
    assert.match(codRes.data.error, /sign in/i);

    // Single use coupon attempt without auth
    const couponRes = await request('/api/payments/create-order', {
      method: 'POST',
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        couponCode: 'WELCOME50',
        paymentMethod: 'razorpay',
        addressDetails: { fullName: 'Guest User', phone: '+91 99999 11111' }
      }
    });
    assert.equal(couponRes.status, 400);
    assert.match(couponRes.data.error, /sign in/i);
  });
});
