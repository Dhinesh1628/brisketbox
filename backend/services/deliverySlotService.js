import mongoose from 'mongoose';
import crypto from 'crypto';
import { DELIVERY_CONFIG, SLOT_HOLD_MINUTES, MAX_USER_ACTIVE_HOLDS } from '../config/deliverySlots.js';
import { DeliverySlot } from '../models/DeliverySlot.js';
import { Order } from '../models/Order.js';
import { db } from '../db.js';

// In-memory slot bookings map for LowDB / non-mongo environments
const inMemorySlotBookings = new Map();

/**
 * Parses a Date into Asia/Kolkata (IST) components
 * @param {Date|string|number} [dateInput]
 * @returns {{ year: number, month: number, day: number, hour: number, minute: number, second: number, dateStr: string, timeStr: string, isoIST: string }}
 */
export function getISTComponents(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DELIVERY_CONFIG.TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(d);
  const map = {};
  for (const p of parts) map[p.type] = p.value;

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10);
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);
  const second = parseInt(map.second, 10);
  const dateStr = `${map.year}-${map.month}-${map.day}`;
  const timeStr = `${map.hour}:${map.minute}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateStr,
    timeStr,
    isoIST: `${dateStr}T${map.hour}:${map.minute}:${map.second}+05:30`
  };
}

/**
 * Returns formatted 12-hour time string (e.g., "02:00 PM")
 */
function formatHour12(h) {
  const hourNum = parseInt(h, 10);
  const period = hourNum >= 12 ? 'PM' : 'AM';
  const displayHour = hourNum % 12 === 0 ? 12 : hourNum % 12;
  return `${String(displayHour).padStart(2, '0')}:00 ${period}`;
}

/**
 * Gets booked count for a slot from MongoDB or in-memory fallback.
 * Capacity is calculated as confirmed bookings plus unexpired holds.
 *
 * @param {string} slotId
 * @param {Date} [now]
 * @returns {Promise<number>}
 */
export async function getBookedCount(slotId, now = new Date()) {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    const slotDoc = await DeliverySlot.findOne({ slotId }).lean();
    if (!slotDoc) return 0;
    const confirmed = Number(slotDoc.confirmedCount || 0);
    const unexpiredHolds = (slotDoc.holds || []).filter(h => new Date(h.expiresAt) > now).length;
    return confirmed + unexpiredHolds;
  }

  const mem = inMemorySlotBookings.get(slotId);
  if (!mem) return 0;
  if (typeof mem === 'number') return mem;
  const confirmed = Number(mem.confirmedCount || 0);
  const unexpiredHolds = (mem.holds || []).filter(h => new Date(h.expiresAt) > now).length;
  return confirmed + unexpiredHolds;
}

/**
 * Generates and returns available future delivery slots based on India time (Asia/Kolkata)
 *
 * @param {Object} [options]
 * @param {Date|string|number} [options.now] - Override current time for deterministic testing
 * @param {number} [options.cutoffMinutes] - Override cutoff minutes
 * @param {number} [options.maxOrdersPerSlot] - Override order limit per slot
 * @param {boolean} [options.includeFull] - Whether to include full slots in list (flagged isFull)
 */
export async function getAvailableDeliverySlots(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const cutoffMinutes = options.cutoffMinutes ?? DELIVERY_CONFIG.CUTOFF_MINUTES_BEFORE_SLOT;
  const maxOrders = options.maxOrdersPerSlot ?? DELIVERY_CONFIG.MAX_ORDERS_PER_SLOT;
  const includeFull = Boolean(options.includeFull);

  const istNow = getISTComponents(now);

  // Generate for Today (day offset 0) and Tomorrow (day offset 1)
  const days = [0, 1];
  const allSlotDefs = [];
  const futureSlotIds = [];

  for (const dayOffset of days) {
    const targetDate = new Date(now.getTime() + (dayOffset * 24 * 60 * 60 * 1000));
    const istTarget = getISTComponents(targetDate);
    const isToday = dayOffset === 0;
    const dayLabel = isToday ? 'Today' : 'Tomorrow';

    for (const win of DELIVERY_CONFIG.SLOT_WINDOWS) {
      const slotId = `${istTarget.dateStr}_${String(win.startHour).padStart(2, '0')}-${String(win.endHour).padStart(2, '0')}`;
      const startHourFormatted = formatHour12(win.startHour);
      const endHourFormatted = formatHour12(win.endHour);
      const label = `${dayLabel}, ${startHourFormatted} - ${endHourFormatted}`;

      // Slot start in UTC for precise cut-off comparison
      const slotStartIso = `${istTarget.dateStr}T${String(win.startHour).padStart(2, '0')}:00:00+05:30`;
      const slotStartTime = new Date(slotStartIso).getTime();
      const cutoffTime = slotStartTime - (cutoffMinutes * 60 * 1000);

      const isPastCutoff = now.getTime() >= cutoffTime;

      if (!isPastCutoff) {
        futureSlotIds.push(slotId);
      }

      allSlotDefs.push({
        slotId,
        dateStr: istTarget.dateStr,
        startHour: win.startHour,
        endHour: win.endHour,
        isToday,
        label,
        isPastCutoff
      });
    }
  }

  // Batch-fetch booked counts in a single DeliverySlot.find query across all future slots
  const bookedCountsMap = new Map();
  const isMongo = Boolean(mongoose.connection && mongoose.connection.readyState === 1);

  if (futureSlotIds.length > 0) {
    if (isMongo) {
      const slotDocs = await DeliverySlot.find({ slotId: { $in: futureSlotIds } }).lean();
      for (const slotDoc of slotDocs) {
        const confirmed = Number(slotDoc.confirmedCount || 0);
        const unexpiredHolds = (slotDoc.holds || []).filter(h => new Date(h.expiresAt) > now).length;
        bookedCountsMap.set(slotDoc.slotId, confirmed + unexpiredHolds);
      }
    } else {
      // In-memory fallback
      for (const sId of futureSlotIds) {
        const mem = inMemorySlotBookings.get(sId);
        if (mem) {
          if (typeof mem === 'number') {
            bookedCountsMap.set(sId, mem);
          } else {
            const confirmed = Number(mem.confirmedCount || 0);
            const unexpiredHolds = (mem.holds || []).filter(h => new Date(h.expiresAt) > now).length;
            bookedCountsMap.set(sId, confirmed + unexpiredHolds);
          }
        }
      }
    }
  }

  const allSlots = [];
  for (const def of allSlotDefs) {
    const bookedCount = def.isPastCutoff ? 0 : (bookedCountsMap.get(def.slotId) || 0);
    const availableCapacity = Math.max(0, maxOrders - bookedCount);
    const isFull = availableCapacity <= 0;

    const slotObj = {
      id: def.slotId,
      date: def.dateStr,
      startTime: `${String(def.startHour).padStart(2, '0')}:00`,
      endTime: `${String(def.endHour).padStart(2, '0')}:00`,
      isToday: def.isToday,
      label: def.label,
      bookedCount,
      maxCapacity: maxOrders,
      availableCapacity,
      isFull,
      isPastCutoff: def.isPastCutoff
    };

    allSlots.push(slotObj);
  }

  // Future available slots: not past cut-off, and not full (unless includeFull is requested)
  const availableSlots = allSlots.filter(s => !s.isPastCutoff && (!s.isFull || includeFull));

  // Determine if Today has any available slot
  const hasTodaySlots = availableSlots.some(s => s.isToday && !s.isFull);
  const nextAvailableSlot = availableSlots.find(s => !s.isFull) || null;

  return {
    currentTimeIST: istNow.isoIST,
    hasTodaySlots,
    nextAvailableSlot,
    slots: availableSlots
  };
}

/**
 * Ensures DeliverySlot document exists in MongoDB, handling concurrent first-upsert E11000 errors by retrying once.
 */
async function ensureSlotDocument(matched) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await DeliverySlot.updateOne(
        { slotId: matched.id },
        {
          $setOnInsert: {
            slotId: matched.id,
            date: matched.date,
            startTime: matched.startTime,
            endTime: matched.endTime,
            label: matched.label,
            maxOrders: matched.maxCapacity,
            confirmedCount: 0,
            bookedCount: 0,
            holds: []
          }
        },
        { upsert: true }
      );
      return;
    } catch (err) {
      if (attempt === 1 && (err.code === 11000 || (err.message && err.message.includes('11000')))) {
        // E11000 duplicate key error on concurrent first upsert: retry once
        continue;
      }
      throw err;
    }
  }
}

/**
 * Counts active unpaid holds for a user to enforce MAX_USER_ACTIVE_HOLDS limit.
 */
async function getUserActiveHoldsCount(userId, now, isMongo) {
  if (!userId || userId === 'anonymous') return 0;

  if (isMongo) {
    const slotsWithHolds = await DeliverySlot.find({
      "holds": { $elemMatch: { userId, expiresAt: { $gt: now } } }
    }).lean();

    let slotHoldsCount = 0;
    for (const s of slotsWithHolds) {
      for (const h of s.holds || []) {
        if (h.userId === userId && new Date(h.expiresAt) > now) {
          slotHoldsCount++;
        }
      }
    }

    const orderHoldsCount = await Order.countDocuments({
      userId,
      paymentStatus: 'PENDING',
      orderStatus: { $in: ['PENDING_PAYMENT', 'CREATED'] },
      slotReleased: { $ne: true },
      holdExpiresAt: { $gt: now }
    });

    return Math.max(slotHoldsCount, orderHoldsCount);
  }

  let memHoldsCount = 0;
  for (const [, slotData] of inMemorySlotBookings.entries()) {
    if (slotData && Array.isArray(slotData.holds)) {
      for (const h of slotData.holds) {
        if (h.userId === userId && new Date(h.expiresAt) > now) {
          memHoldsCount++;
        }
      }
    }
  }
  return memHoldsCount;
}

/**
 * Atomically reserves a place in a delivery slot.
 *
 * Rules:
 * 1. Accepts ONLY an exact slot id. Partial label or name matching is rejected.
 * 2. Online payments: reservation is a HOLD with an expiry (SLOT_HOLD_MINUTES, default 15).
 *    Expired holds stop counting toward capacity. Capacity = confirmedCount + unexpired holds.
 * 3. COD orders: confirmed at creation (directly increments confirmedCount).
 * 4. User hold limit: maximum 2 active unpaid holds per user (refuses 3rd).
 * 5. Handles E11000 duplicate key on concurrent first upsert by retrying once.
 * 6. Never exposes raw database errors to customers.
 *
 * @param {string|Object} param - Slot id string or options object
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, slot: Object }>}
 */
export async function reserveDeliverySlot(param, options = {}) {
  let slotId = '';
  let orderId = `hold_${crypto.randomBytes(6).toString('hex')}`;
  let orderNumber = '';
  let userId = 'anonymous';
  let isCod = false;
  let customNow = null;

  if (typeof param === 'string') {
    slotId = param;
    if (options.orderId) orderId = options.orderId;
    if (options.orderNumber) orderNumber = options.orderNumber;
    if (options.userId) userId = options.userId;
    if (options.isCod !== undefined) isCod = Boolean(options.isCod);
    if (options.now) customNow = options.now;
  } else if (param && typeof param === 'object') {
    slotId = param.slotId || param.deliverySlotId || param.id || '';
    if (param.orderId) orderId = param.orderId;
    if (param.orderNumber) orderNumber = param.orderNumber;
    if (param.userId) userId = param.userId;
    if (param.isCod !== undefined) isCod = Boolean(param.isCod);
    if (param.now) customNow = param.now;
    if (options.now) customNow = options.now;
  }

  if (!slotId || typeof slotId !== 'string') {
    throw new Error('Invalid delivery slot id. Please select an available slot.');
  }

  const cleanSlotId = slotId.trim();
  const now = customNow ? new Date(customNow) : new Date();
  const { slots } = await getAvailableDeliverySlots({ now, includeFull: true });

  // STRICT EXACT MATCH ONLY: No partial matching, no label matching!
  const matched = slots.find(s => s.id === cleanSlotId);

  if (!matched) {
    throw new Error('Invalid delivery slot id. Please select an available slot.');
  }

  if (matched.isPastCutoff) {
    throw new Error('Delivery slot is past its ordering cut-off time. Please select an available slot.');
  }

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  // Enforce 2 active unpaid holds limit per user (only for online orders)
  if (!isCod && userId && userId !== 'anonymous') {
    const userActiveHolds = await getUserActiveHoldsCount(userId, now, isMongo);
    if (userActiveHolds >= MAX_USER_ACTIVE_HOLDS) {
      throw new Error(`You have reached the maximum limit of ${MAX_USER_ACTIVE_HOLDS} active unpaid delivery slot reservations. Please complete payment or cancel existing pending orders.`);
    }
  }

  const holdExpiresAt = new Date(now.getTime() + SLOT_HOLD_MINUTES * 60 * 1000);

  if (isMongo) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await ensureSlotDocument(matched);

        // Atomic capacity check: confirmedCount + count(unexpired holds) < maxOrders
        const filter = {
          slotId: matched.id,
          $expr: {
            $lt: [
              {
                $add: [
                  { $ifNull: ["$confirmedCount", 0] },
                  {
                    $size: {
                      $filter: {
                        input: { $ifNull: ["$holds", []] },
                        as: "h",
                        cond: { $gt: ["$$h.expiresAt", now] }
                      }
                    }
                  }
                ]
              },
              "$maxOrders"
            ]
          }
        };

        const update = isCod
          ? { $inc: { confirmedCount: 1, bookedCount: 1 } }
          : {
              $push: {
                holds: {
                  orderId,
                  orderNumber: orderNumber || '',
                  userId,
                  expiresAt: holdExpiresAt
                }
              },
              $inc: { bookedCount: 1 }
            };

        const updated = await DeliverySlot.findOneAndUpdate(filter, update, { new: true });

        if (!updated) {
          throw new Error(`Delivery slot "${matched.label}" is fully booked. Please select another slot.`);
        }

        const unexpiredHoldsCount = (updated.holds || []).filter(h => new Date(h.expiresAt) > now).length;
        const currentBookedCount = (updated.confirmedCount || 0) + unexpiredHoldsCount;

        return {
          success: true,
          slot: {
            id: updated.slotId,
            label: updated.label,
            date: updated.date,
            bookedCount: currentBookedCount,
            holdExpiresAt: isCod ? null : holdExpiresAt,
            isHold: !isCod
          }
        };
      } catch (err) {
        if (attempt === 1 && (err.code === 11000 || (err.message && err.message.includes('11000')))) {
          // Retry once on E11000 concurrent insert
          continue;
        }
        // Never show raw database errors to customers
        if (err.name === 'MongoServerError' || err.name === 'MongooseError' || err.code === 11000) {
          throw new Error('Unable to reserve delivery slot. Please try again.');
        }
        throw err;
      }
    }
  }

  // LowDB / In-Memory atomic fallback
  let slotRecord = inMemorySlotBookings.get(matched.id);
  if (!slotRecord || typeof slotRecord === 'number') {
    slotRecord = {
      slotId: matched.id,
      confirmedCount: typeof slotRecord === 'number' ? slotRecord : 0,
      bookedCount: typeof slotRecord === 'number' ? slotRecord : 0,
      holds: []
    };
    inMemorySlotBookings.set(matched.id, slotRecord);
  }

  // Count active holds and prune expired
  const validHolds = (slotRecord.holds || []).filter(h => new Date(h.expiresAt) > now);
  slotRecord.holds = validHolds;
  const activeBooked = (slotRecord.confirmedCount || 0) + validHolds.length;

  if (activeBooked >= matched.maxCapacity) {
    throw new Error(`Delivery slot "${matched.label}" is fully booked. Please select another slot.`);
  }

  if (isCod) {
    slotRecord.confirmedCount = (slotRecord.confirmedCount || 0) + 1;
    slotRecord.bookedCount = (slotRecord.bookedCount || 0) + 1;
  } else {
    slotRecord.holds.push({
      orderId,
      orderNumber: orderNumber || '',
      userId,
      expiresAt: holdExpiresAt
    });
    slotRecord.bookedCount = (slotRecord.bookedCount || 0) + 1;
  }

  return {
    success: true,
    slot: {
      id: matched.id,
      label: matched.label,
      date: matched.date,
      bookedCount: (slotRecord.confirmedCount || 0) + slotRecord.holds.length,
      holdExpiresAt: isCod ? null : holdExpiresAt,
      isHold: !isCod
    }
  };
}

/**
 * Confirms a delivery slot hold (converts hold to permanent confirmed booking).
 * Called when finalizePayment marks the order PAID.
 *
 * @param {Object} options
 * @param {string} options.slotId
 * @param {string} options.orderId
 */
export async function confirmDeliverySlotHold({ slotId, orderId }) {
  if (!slotId) return;

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    const updated = await DeliverySlot.findOneAndUpdate(
      { slotId, "holds.orderId": orderId },
      {
        $pull: { holds: { orderId } },
        $inc: { confirmedCount: 1 }
      },
      { new: true }
    );
    if (!updated) {
      // If hold was already expired or not in holds, still ensure confirmedCount is incremented for paid order
      await DeliverySlot.findOneAndUpdate(
        { slotId },
        { $inc: { confirmedCount: 1 } }
      );
    }
    return;
  }

  const mem = inMemorySlotBookings.get(slotId);
  if (mem && typeof mem === 'object') {
    if (Array.isArray(mem.holds)) {
      mem.holds = mem.holds.filter(h => h.orderId !== orderId);
    }
    mem.confirmedCount = (mem.confirmedCount || 0) + 1;
  }
}

/**
 * Releases a delivery slot (idempotent hold release or confirmed booking rollback).
 * Called upon order cancellation, payment failure webhook, or order expiry.
 *
 * @param {Object|string} param
 * @param {string} [param.slotId]
 * @param {string} [param.orderId]
 * @param {boolean} [param.isConfirmed]
 */
export async function releaseDeliverySlot(param) {
  let slotId = '';
  let orderId = null;
  let isConfirmed = false;

  if (typeof param === 'string') {
    slotId = param;
  } else if (param && typeof param === 'object') {
    slotId = param.slotId || '';
    orderId = param.orderId || null;
    isConfirmed = Boolean(param.isConfirmed);
  }

  if (!slotId) return;

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    if (isConfirmed) {
      await DeliverySlot.findOneAndUpdate(
        { slotId, confirmedCount: { $gt: 0 } },
        { $inc: { confirmedCount: -1, bookedCount: -1 } }
      );
    } else if (orderId) {
      await DeliverySlot.findOneAndUpdate(
        { slotId },
        { $pull: { holds: { orderId } } }
      );
    } else {
      await DeliverySlot.findOneAndUpdate(
        { slotId, bookedCount: { $gt: 0 } },
        { $inc: { bookedCount: -1 } }
      );
    }
    return;
  }

  const mem = inMemorySlotBookings.get(slotId);
  if (!mem) return;
  if (typeof mem === 'number') {
    if (mem > 0) inMemorySlotBookings.set(slotId, mem - 1);
    return;
  }
  if (isConfirmed) {
    if (mem.confirmedCount > 0) mem.confirmedCount--;
    if (mem.bookedCount > 0) mem.bookedCount--;
  } else if (orderId && Array.isArray(mem.holds)) {
    mem.holds = mem.holds.filter(h => h.orderId !== orderId);
  }
}

/**
 * Helper for test isolation to set slot booked count directly
 */
export async function _setSlotBookedCount(slotId, count) {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    await DeliverySlot.findOneAndUpdate(
      { slotId },
      { $set: { confirmedCount: count, bookedCount: count, holds: [] } },
      { upsert: true }
    );
    return;
  }
  inMemorySlotBookings.set(slotId, {
    slotId,
    confirmedCount: count,
    bookedCount: count,
    holds: []
  });
}
