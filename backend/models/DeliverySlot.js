import mongoose from 'mongoose';

const deliverySlotSchema = new mongoose.Schema({
  slotId: { type: String, required: true, unique: true, index: true },
  date: { type: String, required: true, index: true }, // 'YYYY-MM-DD'
  startTime: { type: String, required: true }, // '06:00'
  endTime: { type: String, required: true }, // '08:00'
  label: { type: String, required: true }, // e.g. 'Today, 06:00 AM - 08:00 AM'
  bookedCount: { type: Number, default: 0, min: 0 },
  maxOrders: { type: Number, required: true, default: 10 }
}, { timestamps: true });

export const DeliverySlot = mongoose.models.DeliverySlot || mongoose.model('DeliverySlot', deliverySlotSchema);
