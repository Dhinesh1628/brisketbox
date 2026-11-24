import mongoose from 'mongoose';

const walletLedgerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  idempotencyKey: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  orderId: { type: String, default: null, index: true },
  timestamp: { type: String, default: () => new Date().toISOString() }
}, {
  timestamps: true,
  strict: true
});

export const WalletLedger = mongoose.models.WalletLedger || mongoose.model('WalletLedger', walletLedgerSchema);
