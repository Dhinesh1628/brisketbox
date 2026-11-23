import mongoose from 'mongoose';

const walletTransactionSchema = new mongoose.Schema({
  id: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['credit', 'debit'], required: true },
  title: { type: String, default: '' },
  description: { type: String, default: '' },
  balanceBefore: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  orderId: { type: String, default: null },
  timestamp: { type: String, default: () => new Date().toISOString() }
}, { _id: false });

const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: false },
  role: { 
    type: String, 
    enum: ['customer', 'admin', 'rider', 'partner'], 
    default: 'customer',
    index: true 
  },
  approvalStatus: {
    type: String,
    enum: ['pending_approval', 'approved', 'rejected'],
    default: 'approved',
    index: true
  },
  phone: { type: String, default: '', trim: true, index: true },
  city: { type: String, default: 'Bengaluru' },
  address: { type: String, default: '' },
  walletBalance: { type: Number, default: 0, min: 0 },
  walletTransactions: [walletTransactionSchema],
  depositBalance: { type: Number, default: 0 },
  upiId: { type: String, default: '' },
  googleId: { type: String, sparse: true, index: true },
  avatar: { type: String, default: '' },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  emailVerified: { type: Boolean, default: false },
  
  // Partner shop metadata
  shopId: { type: String, default: null },
  shopName: { type: String, default: null },
  shopAddress: { type: String, default: null },
  fssaiNumber: { type: String, default: '' },
  operatingHours: { type: String, default: '' },
  categories: [{ type: String }],
  
  // Rider fleet metadata
  vehicleType: { type: String, default: '' },
  vehicleNumber: { type: String, default: '' },
  licenseNumber: { type: String, default: '' },
  idDocType: { type: String, default: '' },
  assignedHub: { type: String, default: '' },
  isOnline: { type: Boolean, default: false },
  rating: { type: Number, default: 4.9 },
  earningsToday: { type: Number, default: 0 },
  deliveriesToday: { type: Number, default: 0 },
  totalDeliveries: { type: Number, default: 0 },

  lastLogin: { type: Date, default: Date.now }
}, {
  timestamps: true,
  strict: true
});

userSchema.index({ role: 1, approvalStatus: 1 });
userSchema.index({ createdAt: -1 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
