import mongoose from 'mongoose';
import { DELIVERY_CONFIG } from '../config/deliverySlots.js';
import { DeliverySlot } from '../models/DeliverySlot.js';
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
 * Gets booked count for a slot from MongoDB or in-memory fallback
 */
export async function getBookedCount(slotId) {
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    const slotDoc = await DeliverySlot.findOne({ slotId }).lean();
    return Number(slotDoc?.bookedCount || 0);
  }
  return inMemorySlotBookings.get(slotId) || 0;
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
  const allSlots = [];

  for (const dayOffset of days) {
    // Add day offset in milliseconds
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

      // Only evaluate capacity for future slots
      let bookedCount = 0;
      if (!isPastCutoff) {
        bookedCount = await getBookedCount(slotId);
      }

      const availableCapacity = Math.max(0, maxOrders - bookedCount);
      const isFull = availableCapacity <= 0;

      const slotObj = {
        id: slotId,
        date: istTarget.dateStr,
        startTime: `${String(win.startHour).padStart(2, '0')}:00`,
        endTime: `${String(win.endHour).padStart(2, '0')}:00`,
        isToday,
        label,
        bookedCount,
        maxCapacity: maxOrders,
        availableCapacity,
        isFull,
        isPastCutoff
      };

      allSlots.push(slotObj);
    }
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
 * Atomically reserves a place in a delivery slot
 *
 * @param {string} requestedSlot - Slot id or slot label
 * @param {Object} [options]
 * @param {Date|string|number} [options.now]
 * @returns {Promise<{ success: boolean, slot: Object }>}
 */
export async function reserveDeliverySlot(requestedSlot, options = {}) {
  if (!requestedSlot || typeof requestedSlot !== 'string') {
    throw new Error('Please select a valid delivery slot');
  }

  const cleanReq = requestedSlot.trim();
  const { slots } = await getAvailableDeliverySlots({ ...options, includeFull: true });

  // Match by id or label (case-insensitive)
  const matched = slots.find(s => 
    s.id === cleanReq || 
    s.label.toLowerCase() === cleanReq.toLowerCase() ||
    cleanReq.toLowerCase().includes(s.label.toLowerCase()) ||
    s.label.toLowerCase().includes(cleanReq.toLowerCase())
  );

  if (!matched) {
    throw new Error('Delivery slot is no longer available or past cut-off time. Please select an available slot.');
  }

  if (matched.isPastCutoff) {
    throw new Error('Delivery slot is past its ordering cut-off time. Please select an available slot.');
  }

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  if (isMongo) {
    // Upsert the DeliverySlot document so it exists
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
          bookedCount: 0
        }
      },
      { upsert: true }
    );

    // Atomically increment bookedCount ONLY IF bookedCount < maxCapacity
    const updated = await DeliverySlot.findOneAndUpdate(
      { slotId: matched.id, bookedCount: { $lt: matched.maxCapacity } },
      { $inc: { bookedCount: 1 } },
      { new: true }
    );

    if (!updated) {
      throw new Error(`Delivery slot "${matched.label}" is fully booked. Please select another slot.`);
    }

    return {
      success: true,
      slot: {
        id: updated.slotId,
        label: updated.label,
        date: updated.date,
        bookedCount: updated.bookedCount
      }
    };
  }

  // LowDB / In-Memory atomic update
  const currentCount = inMemorySlotBookings.get(matched.id) || 0;
  if (currentCount >= matched.maxCapacity) {
    throw new Error(`Delivery slot "${matched.label}" is fully booked. Please select another slot.`);
  }

  inMemorySlotBookings.set(matched.id, currentCount + 1);

  return {
    success: true,
    slot: {
      id: matched.id,
      label: matched.label,
      date: matched.date,
      bookedCount: currentCount + 1
    }
  };
}

/**
 * Releases a booked place in a delivery slot (e.g. upon order cancellation or payment failure)
 */
export async function releaseDeliverySlot(slotId) {
  if (!slotId) return;

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    await DeliverySlot.findOneAndUpdate(
      { slotId, bookedCount: { $gt: 0 } },
      { $inc: { bookedCount: -1 } }
    );
    return;
  }

  const current = inMemorySlotBookings.get(slotId) || 0;
  if (current > 0) {
    inMemorySlotBookings.set(slotId, current - 1);
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
      { $set: { bookedCount: count } },
      { upsert: true }
    );
    return;
  }
  inMemorySlotBookings.set(slotId, count);
}
