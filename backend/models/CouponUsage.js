import mongoose from 'mongoose';

const couponUsageSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  code: { type: String, required: true, uppercase: true, index: true },
  userId: { type: String, required: true, index: true },
  phone: { type: String, default: null, index: true },
  orderId: { type: String, required: true, index: true },
  discount: { type: Number, default: 0 },
  redeemedAt: { type: String, default: () => new Date().toISOString() }
}, {
  timestamps: true,
  strict: true
});

couponUsageSchema.index({ code: 1, userId: 1 }, { unique: true });
couponUsageSchema.index({ code: 1, orderId: 1 }, { unique: true });

export const CouponUsage = mongoose.models.CouponUsage || mongoose.model('CouponUsage', couponUsageSchema);
