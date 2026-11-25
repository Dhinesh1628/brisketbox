import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { _setSlotBookedCount, getAvailableDeliverySlots } from '../services/deliverySlotService.js';
import { MAX_TIP_INR } from '../config/deliverySlots.js';

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

describe('Real Delivery Slots & Tip Capping Test Suite', () => {
  let customerUser;
  let customerToken;
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

    customerUser = {
      id: `cust_slot_${runId}`,
      name: 'Slot Test Customer',
      email: `slot.cust.${runId}@example.com`,
      role: 'customer',
      walletBalance: 0,
      walletTransactions: []
    };
    db.insert('users', customerUser);
    customerToken = makeToken(customerUser);

    testProduct = {
      id: `prod_slot_${runId}`,
      name: 'Surmai Steaks Test',
      category: 'Fish & Seafood',
      price: 499,
      stock: 50,
      unit: '500g',
      netWeight: '500g',
      cutStyle: 'Steaks'
    };
    db.insert('products', testProduct);
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      db.delete('users', customerUser.id);
      db.delete('products', testProduct.id);
    } catch (e) {}
  });

  // =========================================================================
  // 1. GET /api/delivery/slots endpoint and cut-off verification
  // =========================================================================
  it('1.1 GET /api/delivery/slots returns only future slots in Asia/Kolkata', async () => {
    const res = await request('/api/delivery/slots');
    assert.equal(res.status, 200);
    assert.ok(res.data.currentTimeIST, 'Must return currentTimeIST');
    assert.ok(Array.isArray(res.data.slots), 'Must return slots array');
    assert.ok(res.data.slots.length > 0, 'Must have available slots');

    // All slots must have required fields
    for (const slot of res.data.slots) {
      assert.ok(slot.id);
      assert.ok(slot.date);
      assert.ok(slot.label);
      assert.equal(slot.isPastCutoff, false, 'No past cutoff slots should be returned');
      assert.equal(slot.isFull, false, 'Full slots should not be in available list');
    }
  });

  it('1.2 "Today" never shows after the last cut-off time (e.g. 21:30 IST)', async () => {
    // 21:30 IST is past the last slot cutoff (20:00 - 22:00 cutoff was at 19:15 IST)
    const lateNightIST = '2026-11-25T21:30:00+05:30';
    const res = await request(`/api/delivery/slots?simulatedTime=${encodeURIComponent(lateNightIST)}`);
    assert.equal(res.status, 200);
    assert.equal(res.data.hasTodaySlots, false, 'hasTodaySlots must be false after the last cut-off');

    // Verify no slot contains "Today"
    for (const slot of res.data.slots) {
      assert.equal(slot.isToday, false, 'No returned slot can be Today');
      assert.ok(!slot.label.toLowerCase().startsWith('today'), `Slot label "${slot.label}" must not say Today`);
      assert.ok(slot.label.toLowerCase().startsWith('tomorrow'), `Slot label "${slot.label}" should be Tomorrow`);
    }
  });

  // =========================================================================
  // 2. Reject past delivery slot
  // =========================================================================
  it('2.1 Placing order with a past delivery slot is rejected with 400', async () => {
    const res = await request('/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlot: '2020-01-01_06-08', // Explicitly past slot
        paymentMethod: 'razorpay'
      }
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /not|available|past|cut-off/i);
  });

  // =========================================================================
  // 3. Reject full delivery slot
  // =========================================================================
  it('3.1 Placing order with a fully booked delivery slot is rejected with 400', async () => {
    const { nextAvailableSlot } = await getAvailableDeliverySlots();
    assert.ok(nextAvailableSlot, 'Must have an available slot');

    // Pre-seed this slot to maxCapacity (10)
    await _setSlotBookedCount(nextAvailableSlot.id, nextAvailableSlot.maxCapacity);

    const res = await request('/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        deliverySlot: nextAvailableSlot.id,
        paymentMethod: 'razorpay'
      }
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /fully booked|select another slot/i);

    // Clean up
    await _setSlotBookedCount(nextAvailableSlot.id, 0);
  });

  // =========================================================================
  // 4. Two concurrent orders for the last place produce exactly one success
  // =========================================================================
  it('4.1 Two concurrent orders for the last place produce exactly one success and one rejection', async () => {
    const { slots } = await getAvailableDeliverySlots();
    // Choose tomorrow's first slot for stability
    const targetSlot = slots.find(s => !s.isToday) || slots[0];
    assert.ok(targetSlot, 'Target slot must exist');

    // Set capacity so exactly 1 slot remains: bookedCount = maxCapacity - 1
    const lastPlaceCount = targetSlot.maxCapacity - 1;
    await _setSlotBookedCount(targetSlot.id, lastPlaceCount);

    // Fire two orders simultaneously for the exact same slot
    const [resA, resB] = await Promise.all([
      request('/api/payments/create-order', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          items: [{ productId: testProduct.id, quantity: 1 }],
          deliverySlot: targetSlot.id,
          paymentMethod: 'razorpay'
        }
      }),
      request('/api/payments/create-order', {
        method: 'POST',
        headers: { Authorization: `Bearer ${customerToken}` },
        body: {
          items: [{ productId: testProduct.id, quantity: 1 }],
          deliverySlot: targetSlot.id,
          paymentMethod: 'razorpay'
        }
      })
    ]);

    const statuses = [resA.status, resB.status];
    const successes = statuses.filter(s => s === 200 || s === 201);
    const failures = statuses.filter(s => s === 400);

    assert.equal(successes.length, 1, `Expected exactly one success, got statuses: ${statuses.join(', ')}`);
    assert.equal(failures.length, 1, `Expected exactly one failure, got statuses: ${statuses.join(', ')}`);

    const failedRes = resA.status === 400 ? resA : resB;
    assert.match(failedRes.data.error, /fully booked|select another slot/i);

    // Clean up
    await _setSlotBookedCount(targetSlot.id, 0);
  });

  // =========================================================================
  // 5. Tip capping with MAX_TIP_INR
  // =========================================================================
  it('5.1 Order with tip exceeding MAX_TIP_INR (200) is rejected with 400', async () => {
    const res = await request('/api/payments/create-order', {
      method: 'POST',
      headers: { Authorization: `Bearer ${customerToken}` },
      body: {
        items: [{ productId: testProduct.id, quantity: 1 }],
        tipAmount: 250,
        paymentMethod: 'razorpay'
      }
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /tip cannot exceed ₹200/i);
  });

  it('5.2 Order with tip within MAX_TIP_INR (₹0, ₹20, ₹30, ₹50, ₹200) succeeds', async () => {
    for (const validTip of [0, 20, 30, 50, 200]) {
      const tipUser = {
        id: `cust_tip_${validTip}_${Date.now().toString(36)}`,
        name: `Tip User ${validTip}`,
        email: `tip.${validTip}.${Date.now().toString(36)}@example.com`,
        role: 'customer',
        walletBalance: 0
      };
      db.insert('users', tipUser);
      const tipToken = makeToken(tipUser);

      const res = await request('/api/payments/create-order', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tipToken}` },
        body: {
          items: [{ productId: testProduct.id, quantity: 1 }],
          tipAmount: validTip,
          paymentMethod: 'razorpay'
        }
      });

      assert.equal(res.status, 200, `Tip of ₹${validTip} should succeed`);
      assert.ok(res.data.orderId);
    }
  });

  // =========================================================================
  // 6. Delivery slots batch query and in-memory fallback
  // =========================================================================
  it('6.1 getAvailableDeliverySlots batches booked counts and preserves exact structure & counts', async () => {
    const { slots: initialSlots } = await getAvailableDeliverySlots();
    assert.ok(Array.isArray(initialSlots) && initialSlots.length > 0, 'Must return array of slots');

    // Pick two tomorrow slots to modify
    const tomorrowSlots = initialSlots.filter(s => !s.isToday);
    assert.ok(tomorrowSlots.length >= 2, 'Must have at least two tomorrow slots');

    const slotA = tomorrowSlots[0];
    const slotB = tomorrowSlots[1];

    // Set slotA bookedCount to 3 and slotB bookedCount to 7
    await _setSlotBookedCount(slotA.id, 3);
    await _setSlotBookedCount(slotB.id, 7);

    // Call getAvailableDeliverySlots which performs the batch lookup
    const res = await getAvailableDeliverySlots();
    assert.ok(res.currentTimeIST, 'Must contain currentTimeIST');
    assert.equal(typeof res.hasTodaySlots, 'boolean', 'Must contain boolean hasTodaySlots');
    assert.ok(Array.isArray(res.slots), 'Must contain slots array');

    const updatedSlotA = res.slots.find(s => s.id === slotA.id);
    const updatedSlotB = res.slots.find(s => s.id === slotB.id);

    assert.ok(updatedSlotA, 'Slot A must be returned');
    assert.equal(updatedSlotA.bookedCount, 3, 'Slot A bookedCount must be 3');
    assert.equal(updatedSlotA.availableCapacity, updatedSlotA.maxCapacity - 3, 'Slot A availableCapacity must match');

    assert.ok(updatedSlotB, 'Slot B must be returned');
    assert.equal(updatedSlotB.bookedCount, 7, 'Slot B bookedCount must be 7');
    assert.equal(updatedSlotB.availableCapacity, updatedSlotB.maxCapacity - 7, 'Slot B availableCapacity must match');

    // Verify all slot objects have the required schema fields
    for (const s of res.slots) {
      assert.ok(s.id, 'Slot must have id');
      assert.ok(s.date, 'Slot must have date');
      assert.ok(s.startTime, 'Slot must have startTime');
      assert.ok(s.endTime, 'Slot must have endTime');
      assert.equal(typeof s.isToday, 'boolean', 'Slot must have boolean isToday');
      assert.ok(s.label, 'Slot must have label');
      assert.equal(typeof s.bookedCount, 'number', 'Slot must have number bookedCount');
      assert.equal(typeof s.maxCapacity, 'number', 'Slot must have number maxCapacity');
      assert.equal(typeof s.availableCapacity, 'number', 'Slot must have number availableCapacity');
      assert.equal(typeof s.isFull, 'boolean', 'Slot must have boolean isFull');
      assert.equal(typeof s.isPastCutoff, 'boolean', 'Slot must have boolean isPastCutoff');
    }

    // Clean up
    await _setSlotBookedCount(slotA.id, 0);
    await _setSlotBookedCount(slotB.id, 0);
  });
});
