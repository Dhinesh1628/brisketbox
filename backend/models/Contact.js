import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, default: '', trim: true },
  phone: { type: String, required: true, trim: true, index: true },
  category: { type: String, default: 'general' },
  orderId: { type: String, default: null, index: true },
  message: { type: String, required: true },
  status: { type: String, default: 'OPEN', index: true }
}, {
  timestamps: true,
  strict: true
});

export const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);
