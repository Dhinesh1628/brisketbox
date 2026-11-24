export const ORDER_LIFECYCLE = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  CONFIRMED: 'CONFIRMED',
  PREPARING: 'PREPARING',
  READY_FOR_PICKUP: 'READY_FOR_PICKUP',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  ARRIVED: 'ARRIVED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
};

export const normalizeLifecycle = (status) => {
  if (!status) return ORDER_LIFECYCLE.CONFIRMED;
  const s = String(status).toUpperCase().replace(/\s+/g, '_');
  if (s === 'PENDING_PAYMENT') return ORDER_LIFECYCLE.PENDING_PAYMENT;
  if (s === 'PLACED' || s === 'CONFIRMED' || s === 'NEW') return ORDER_LIFECYCLE.CONFIRMED;
  if (s === 'PREPARING' || s === 'CUTTING' || s === 'IN_KITCHEN' || s === 'ACTIVE') return ORDER_LIFECYCLE.PREPARING;
  if (s === 'PACKED' || s === 'READY_FOR_PICKUP' || s === 'READY') return ORDER_LIFECYCLE.READY_FOR_PICKUP;
  if (s === 'OUT_FOR_DELIVERY' || s === 'DISPATCHED' || s === 'PICKED_UP') return ORDER_LIFECYCLE.OUT_FOR_DELIVERY;
  if (s === 'ARRIVED' || s === 'DOORSTEP' || s === 'REACHED_DOORSTEP') return ORDER_LIFECYCLE.ARRIVED;
  if (s === 'DELIVERED' || s === 'COMPLETED') return ORDER_LIFECYCLE.DELIVERED;
  if (s === 'CANCELLED') return ORDER_LIFECYCLE.CANCELLED;
  return s;
};

export const ALLOWED_TRANSITIONS = {
  [ORDER_LIFECYCLE.PENDING_PAYMENT]: [ORDER_LIFECYCLE.CONFIRMED, ORDER_LIFECYCLE.CANCELLED],
  [ORDER_LIFECYCLE.CONFIRMED]: [ORDER_LIFECYCLE.PREPARING, ORDER_LIFECYCLE.CANCELLED],
  [ORDER_LIFECYCLE.PREPARING]: [ORDER_LIFECYCLE.READY_FOR_PICKUP, ORDER_LIFECYCLE.CANCELLED],
  [ORDER_LIFECYCLE.READY_FOR_PICKUP]: [ORDER_LIFECYCLE.OUT_FOR_DELIVERY, ORDER_LIFECYCLE.CANCELLED],
  [ORDER_LIFECYCLE.OUT_FOR_DELIVERY]: [ORDER_LIFECYCLE.ARRIVED, ORDER_LIFECYCLE.DELIVERED, ORDER_LIFECYCLE.CANCELLED],
  [ORDER_LIFECYCLE.ARRIVED]: [ORDER_LIFECYCLE.DELIVERED, ORDER_LIFECYCLE.CANCELLED],
  [ORDER_LIFECYCLE.DELIVERED]: [],
  [ORDER_LIFECYCLE.CANCELLED]: []
};

export const isValidTransition = (fromRaw, toRaw) => {
  const from = normalizeLifecycle(fromRaw);
  const to = normalizeLifecycle(toRaw);

  if (from === to) return true; // idempotent
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
};

export const canRoleExecuteTransition = (role, fromRaw, toRaw) => {
  if (role === 'admin') return true;

  const from = normalizeLifecycle(fromRaw);
  const to = normalizeLifecycle(toRaw);

  if (role === 'partner') {
    return (
      (from === ORDER_LIFECYCLE.CONFIRMED && to === ORDER_LIFECYCLE.PREPARING) ||
      (from === ORDER_LIFECYCLE.PREPARING && to === ORDER_LIFECYCLE.READY_FOR_PICKUP)
    );
  }

  if (role === 'rider') {
    return (
      (from === ORDER_LIFECYCLE.READY_FOR_PICKUP && to === ORDER_LIFECYCLE.OUT_FOR_DELIVERY) ||
      (from === ORDER_LIFECYCLE.OUT_FOR_DELIVERY && to === ORDER_LIFECYCLE.ARRIVED) ||
      (from === ORDER_LIFECYCLE.OUT_FOR_DELIVERY && to === ORDER_LIFECYCLE.DELIVERED) ||
      (from === ORDER_LIFECYCLE.ARRIVED && to === ORDER_LIFECYCLE.DELIVERED)
    );
  }

  if (role === 'customer') {
    return (
      (from === ORDER_LIFECYCLE.PENDING_PAYMENT || from === ORDER_LIFECYCLE.CONFIRMED) &&
      to === ORDER_LIFECYCLE.CANCELLED
    );
  }

  return false;
};
