import mongoose from 'mongoose';

const refundSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  refundId: { type: String, default: null, index: true }, // Gateway refund identifier (e.g. rfnd_xxx)
  orderId: { type: String, required: true, index: true },
  paymentId: { type: String, required: true, index: true }, // Gateway payment identifier (e.g. pay_xxx)
  amount: { type: Number, required: true }, // Amount refunded in INR
  currency: { type: String, default: 'INR' },
  status: { type: String, enum: ['PENDING', 'PROCESSED', 'FAILED'], default: 'PENDING', index: true },
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  reason: { type: String, default: 'Customer or operations refund' },
  gatewayResponse: { type: mongoose.Schema.Types.Mixed, default: {} },
  error: { type: String, default: null },
  attempts: { type: Number, default: 1 },
  processedAt: { type: String, default: null }
}, {
  timestamps: true,
  strict: true
});

export const Refund = mongoose.models.Refund || mongoose.model('Refund', refundSchema);
