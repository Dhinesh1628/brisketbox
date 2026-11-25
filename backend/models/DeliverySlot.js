import mongoose from 'mongoose';

const slotHoldSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  orderNumber: { type: String, default: '' },
  userId: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { _id: false });

const deliverySlotSchema = new mongoose.Schema({
  slotId: { type: String, required: true, unique: true, index: true },
  date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
  startTime: { type: String, required: true }, // '06:00'
  endTime: { type: String, required: true }, // '08:00'
  label: { type: String, required: true }, // e.g. 'Today, 06:00 AM - 08:00 AM'
  maxOrders: { type: Number, required: true, default: 10 },
  confirmedCount: { type: Number, default: 0, min: 0 },
  bookedCount: { type: Number, default: 0, min: 0 },
  holds: [slotHoldSchema]
}, { timestamps: true });

export const DeliverySlot = mongoose.models.DeliverySlot || mongoose.model('DeliverySlot', deliverySlotSchema);
