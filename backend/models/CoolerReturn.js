import mongoose from 'mongoose';

const coolerReturnSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  coolerId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  userAddress: { type: String, required: true },
  status: {
    type: String,
    enum: ['pickup_requested', 'pickup_assigned', 'picked_up', 'sanitizing_inspected', 'refunded'],
    default: 'pickup_requested',
    index: true
  },
  requestDate: { type: Date, default: Date.now },
  scheduledPickupSlot: { type: String, default: 'Tomorrow Morning, 7:00 AM - 10:00 AM' },
  refundAmount: { type: Number, default: 0 },
  refundMode: { type: String, default: 'UPI' },
  notes: { type: String, default: '' },
  conditionNotes: { type: String, default: '' },
  courierAssigned: { type: String, default: '' }
}, {
  timestamps: true,
  strict: true
});

coolerReturnSchema.index({ status: 1, requestDate: -1 });

export const CoolerReturn = mongoose.models.CoolerReturn || mongoose.model('CoolerReturn', coolerReturnSchema);
