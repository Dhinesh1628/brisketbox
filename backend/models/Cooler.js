import mongoose from 'mongoose';

const coolerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  qrCode: { type: String, index: true },
  coolerCode: { type: String, index: true },
  rfidTag: { type: String, default: '' },
  model: { type: String, default: 'ThermalVault Reusable Cold-Gel Box' },
  status: { 
    type: String, 
    enum: ['available', 'assigned', 'with_customer', 'returned', 'damaged', 'maintenance'],
    default: 'available',
    index: true 
  },
  currentOrderId: { type: String, default: null, index: true },
  currentUserId: { type: String, default: null, index: true },
  currentUserName: { type: String, default: null },
  cyclesUsed: { type: Number, default: 0 },
  lastSanitizedDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
  depositAmount: { type: Number, default: 0 },
  maxHoldingHours: { type: Number, default: 48 },
  assignedHub: { type: String, default: 'Regional Hub Depot' },
  maintenanceReason: { type: String, default: '' }
}, {
  timestamps: true,
  strict: true
});

coolerSchema.index({ status: 1, assignedHub: 1 });

export const Cooler = mongoose.models.Cooler || mongoose.model('Cooler', coolerSchema);
