/**
 * Delivery Slot Configuration
 * Timezone: Asia/Kolkata (IST: UTC+5:30)
 */

export const DELIVERY_CONFIG = {
  TIMEZONE: 'Asia/Kolkata',
  OPENING_HOUR: 6, // 06:00 IST
  CLOSING_HOUR: 22, // 22:00 IST
  CUTOFF_MINUTES_BEFORE_SLOT: Number(process.env.DELIVERY_SLOT_CUTOFF_MINUTES) || 45,
  MAX_ORDERS_PER_SLOT: Number(process.env.MAX_ORDERS_PER_SLOT) || Number(process.env.SLOT_ORDER_LIMIT) || 10,
  DAYS_AHEAD: 2, // Today and Tomorrow
  SLOT_WINDOWS: [
    { startHour: 6, endHour: 8, label: '06:00 AM - 08:00 AM' },
    { startHour: 8, endHour: 10, label: '08:00 AM - 10:00 AM' },
    { startHour: 10, endHour: 12, label: '10:00 AM - 12:00 PM' },
    { startHour: 12, endHour: 14, label: '12:00 PM - 02:00 PM' },
    { startHour: 14, endHour: 16, label: '02:00 PM - 04:00 PM' },
    { startHour: 16, endHour: 18, label: '04:00 PM - 06:00 PM' },
    { startHour: 18, endHour: 20, label: '06:00 PM - 08:00 PM' },
    { startHour: 20, endHour: 22, label: '08:00 PM - 10:00 PM' }
  ]
};

export const MAX_TIP_INR = Number(process.env.MAX_TIP_INR) || 200;
