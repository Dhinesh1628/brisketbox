import mongoose from 'mongoose';

const paymentEventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  paymentId: { type: String, default: null, index: true },
  amount: { type: Number, default: 0 },
  currency: { type: String, default: 'INR' },
  source: { type: String, enum: ['verify', 'webhook', 'refund', 'simulation'], default: 'verify' },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, default: 'PROCESSED' }
}, {
  timestamps: true,
  strict: true
});

export const PaymentEvent = mongoose.models.PaymentEvent || mongoose.model('PaymentEvent', paymentEventSchema);
