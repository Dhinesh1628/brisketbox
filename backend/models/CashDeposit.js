import mongoose from 'mongoose';

const cashDepositSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  riderId: { type: String, required: true, index: true },
  riderName: { type: String, default: '' },
  amount: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ['PENDING', 'CONFIRMED', 'REJECTED'], default: 'PENDING', index: true },
  depotId: { type: String, default: 'DEPOT-BLR-CENTRAL' },
  receiptNo: { type: String, required: true, unique: true },
  notes: { type: String, default: '' },
  confirmedBy: { type: String, default: null },
  confirmedAt: { type: String, default: null }
}, {
  timestamps: true,
  strict: true
});

export const CashDeposit = mongoose.models.CashDeposit || mongoose.model('CashDeposit', cashDepositSchema);
