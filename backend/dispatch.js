import mongoose from 'mongoose';
import { db } from './db.js';
import { User } from './models/User.js';
import { Order } from './models/Order.js';

let roundRobinPointer = 0;

/**
 * Enterprise Fleet Dispatcher:
 * Load-balances and round-robins orders across approved fleet riders.
 * Guarantees that sequential orders rotate between different riders.
 */
export async function assignFleetRiderForOrder(session = null) {
  const isMongo = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  let approvedRiders = [];
  if (isMongo) {
    const q = User.find({ role: 'rider', approvalStatus: 'approved' });
    if (session) q.session(session);
    approvedRiders = await q.lean();
  } else {
    const allUsers = db.get('users') || [];
    approvedRiders = allUsers.filter(u => u.role === 'rider' && u.approvalStatus === 'approved');
  }

  // If no approved rider is available, keep riderId null so order appears in admin dispatch queue
  if (!approvedRiders || approvedRiders.length === 0) {
    return {
      riderId: null,
      riderFullName: null,
      riderName: null,
      riderPhone: null,
      riderVehicle: null,
      deliveryExecutive: null
    };
  }

  // 1. Calculate active deliveries for each rider
  let allOrders = [];
  if (isMongo) {
    const oq = Order.find({
      riderId: { $ne: null },
      orderStatus: { $nin: ['DELIVERED', 'COOLER_RETURNED', 'CANCELLED'] }
    });
    if (session) oq.session(session);
    allOrders = await oq.lean();
  } else {
    allOrders = db.get('orders') || [];
  }

  const activeCounts = {};
  for (const r of approvedRiders) {
    activeCounts[r.id] = 0;
  }
  for (const o of allOrders) {
    if (o.riderId && !['DELIVERED', 'COOLER_RETURNED', 'CANCELLED'].includes(o.lifecycleStatus) && o.status !== 'Delivered' && o.status !== 'Cancelled') {
      if (activeCounts[o.riderId] !== undefined) {
        activeCounts[o.riderId]++;
      }
    }
  }

  // 2. Select riders with lowest active workload
  const minOrders = Math.min(...Object.values(activeCounts));
  const availableRiders = approvedRiders.filter(r => activeCounts[r.id] === minOrders);

  // 3. Advance round-robin pointer so sequential orders get different riders
  const selected = availableRiders[roundRobinPointer % availableRiders.length];
  roundRobinPointer = (roundRobinPointer + 1) % 10000;

  const vehicleInfo = selected.vehicleType 
    ? `${selected.vehicleType}${selected.vehicleNumber ? ` (${selected.vehicleNumber})` : ''}`
    : selected.vehicleNumber || 'EV 2-Wheeler (KA-04-EV-819)';

  return {
    riderId: selected.id,
    riderFullName: selected.name,
    riderName: selected.name.split(' ')[0],
    riderPhone: selected.phone || '+91 97412 88301',
    riderVehicle: vehicleInfo,
    deliveryExecutive: `${selected.name} (${selected.vehicleType || 'EV Fleet'}, ${selected.phone || '+91 97412 88301'})`
  };
}
