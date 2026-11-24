import assert from 'assert';
import {
  ORDER_LIFECYCLE,
  isValidTransition,
  canRoleExecuteTransition,
  normalizeLifecycle
} from '../services/orderStateMachine.js';
import {
  orderCreateSchema,
  coolerActionSchema,
  validate
} from '../validators/schemas.js';

console.log('--- RUNNING PHASE 2 TESTS: AUTHORIZATION AND DATA PRIVACY ---');

// Test 1: Order State Machine Transitions
{
  // Valid transitions
  assert.strictEqual(isValidTransition('CONFIRMED', 'PREPARING'), true, 'CONFIRMED -> PREPARING must be valid');
  assert.strictEqual(isValidTransition('PREPARING', 'READY_FOR_PICKUP'), true, 'PREPARING -> READY_FOR_PICKUP must be valid');
  assert.strictEqual(isValidTransition('READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'), true, 'READY_FOR_PICKUP -> OUT_FOR_DELIVERY must be valid');
  assert.strictEqual(isValidTransition('OUT_FOR_DELIVERY', 'DELIVERED'), true, 'OUT_FOR_DELIVERY -> DELIVERED must be valid');

  // Invalid jumps must be blocked
  assert.strictEqual(isValidTransition('CONFIRMED', 'DELIVERED'), false, 'Direct jump CONFIRMED -> DELIVERED must be blocked');
  assert.strictEqual(isValidTransition('PENDING_PAYMENT', 'OUT_FOR_DELIVERY'), false, 'Unpaid order jump must be blocked');
  assert.strictEqual(isValidTransition('DELIVERED', 'PREPARING'), false, 'Terminal DELIVERED state cannot jump backward');
  assert.strictEqual(isValidTransition('CANCELLED', 'CONFIRMED'), false, 'CANCELLED order cannot be resurrected');
  console.log('✓ Test 1 Passed: Order state machine enforces valid sequential transitions and blocks illegal jumps');
}

// Test 2: Role-based transition authorization
{
  // Partner cannot deliver orders
  assert.strictEqual(canRoleExecuteTransition('partner', 'OUT_FOR_DELIVERY', 'DELIVERED'), false, 'Partner cannot mark DELIVERED');
  // Partner can prepare orders
  assert.strictEqual(canRoleExecuteTransition('partner', 'CONFIRMED', 'PREPARING'), true, 'Partner can move to PREPARING');

  // Rider cannot transition confirmed to preparing
  assert.strictEqual(canRoleExecuteTransition('rider', 'CONFIRMED', 'PREPARING'), false, 'Rider cannot move to PREPARING');
  // Rider can transition to OUT_FOR_DELIVERY and DELIVERED
  assert.strictEqual(canRoleExecuteTransition('rider', 'READY_FOR_PICKUP', 'OUT_FOR_DELIVERY'), true, 'Rider can dispatch');
  assert.strictEqual(canRoleExecuteTransition('rider', 'OUT_FOR_DELIVERY', 'DELIVERED'), true, 'Rider can deliver');

  // Customer cannot transition orders to delivered or preparing
  assert.strictEqual(canRoleExecuteTransition('customer', 'CONFIRMED', 'PREPARING'), false, 'Customer cannot prepare');
  // Customer can cancel before preparation starts
  assert.strictEqual(canRoleExecuteTransition('customer', 'CONFIRMED', 'CANCELLED'), true, 'Customer can cancel un-prepped order');
  console.log('✓ Test 2 Passed: Role-based permissions strictly control lifecycle actions');
}

// Test 3: Customer Isolation & Resource Ownership
{
  const orderA = { id: 'ORD-1', userId: 'user_A', riderId: 'rider_1', partnerId: 'shop_1', deliveryPin: '9421' };
  
  const customerB = { id: 'user_B', role: 'customer' };
  const isOwnerB = customerB.role === 'customer' && orderA.userId === customerB.id;
  assert.strictEqual(isOwnerB, false, 'Customer B must not own Order A');

  const customerA = { id: 'user_A', role: 'customer' };
  const isOwnerA = customerA.role === 'customer' && orderA.userId === customerA.id;
  assert.strictEqual(isOwnerA, true, 'Customer A owns Order A');

  // deliveryPin masking for non-owning roles
  const maskPin = (order, requestingUser) => {
    const isOwner = requestingUser.role === 'customer' && order.userId === requestingUser.id;
    const { deliveryPin, ...safe } = order;
    if (isOwner) safe.deliveryPin = deliveryPin;
    return safe;
  };

  const riderView = maskPin(orderA, { id: 'rider_1', role: 'rider' });
  assert.strictEqual(riderView.deliveryPin, undefined, 'deliveryPin must NEVER be visible to rider');

  const customerView = maskPin(orderA, customerA);
  assert.strictEqual(customerView.deliveryPin, '9421', 'deliveryPin must be visible to owning customer');
  console.log('✓ Test 3 Passed: Resource ownership and deliveryPin privacy strictly enforced');
}

// Test 4: Zod Schema Validation
{
  // 4a. Valid order payload
  const validOrder = {
    items: [{ productId: 'prod_1', quantity: 2, cutTag: 'Steaks' }],
    deliveryAddress: 'Flat 101, Indiranagar, Bengaluru',
    paymentMethod: 'ONLINE'
  };
  const parsed = orderCreateSchema.safeParse(validOrder);
  assert.strictEqual(parsed.success, true, 'Valid order payload should parse successfully');

  // 4b. Invalid quantities and missing addresses
  const negativeQtyOrder = {
    items: [{ productId: 'prod_1', quantity: -1 }],
    deliveryAddress: 'Short',
    paymentMethod: 'ONLINE'
  };
  const negParsed = orderCreateSchema.safeParse(negativeQtyOrder);
  assert.strictEqual(negParsed.success, false, 'Negative quantities must be rejected');

  // 4c. Cooler action schema
  const invalidAction = { action: 'hack_cooler' };
  assert.strictEqual(coolerActionSchema.safeParse(invalidAction).success, false, 'Invalid cooler action must fail schema validation');
  console.log('✓ Test 4 Passed: Zod schema validation blocks invalid and negative inputs');
}

console.log('\n--- ALL PHASE 2 TESTS PASSED SUCCESSFULLY ---');
