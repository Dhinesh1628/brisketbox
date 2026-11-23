import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  productId: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true, min: 1 },
  cutStyle: { type: String, default: 'Master Butchered' },
  unit: { type: String, default: '500g' },
  netWeight: { type: String, default: '500g' },
  imageUrl: { type: String, default: '' },
  image: { type: String, default: '' }
}, { _id: false });

const tempLogSchema = new mongoose.Schema({
  time: { type: String, required: true },
  temp: { type: Number, required: true },
  event: { type: String, default: '' }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  orderNumber: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  customerName: { type: String, required: true },
  customerEmail: { type: String, required: true },
  customerPhone: { type: String, required: true },
  items: [orderItemSchema],
  
  // Pricing breakdown strictly verified on server
  subtotal: { type: Number, required: true, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  couponCode: { type: String, default: null },
  coolerDeposit: { type: Number, default: 0, min: 0 },
  shippingFee: { type: Number, default: 0, min: 0 },
  tipAmount: { type: Number, default: 0, min: 0 },
  walletDeduction: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  totalAmount: { type: Number, required: true, min: 0 },
  amountInPaise: { type: Number, default: 0 },

  // Delivery & Location details
  deliveryAddress: { type: String, required: true },
  addressDetails: {
    fullName: { type: String },
    phone: { type: String },
    email: { type: String },
    flatNo: { type: String },
    building: { type: String },
    street: { type: String },
    city: { type: String, default: 'Bengaluru' },
    state: { type: String, default: 'Karnataka' },
    pincode: { type: String },
    instructions: { type: String }
  },
  deliverySlot: { type: String, default: 'Today, Express in 90 Mins' },
  city: { type: String, default: 'Bengaluru', index: true },
  deliveryNotes: { type: String, default: '' },

  // Order Pipeline State Machine
  orderStatus: {
    type: String,
    enum: [
      'PENDING_PAYMENT',
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'ARRIVED',
      'DELIVERED',
      'CANCELLED'
    ],
    default: 'PENDING_PAYMENT',
    index: true
  },
  lifecycleStatus: {
    type: String,
    enum: [
      'PENDING_PAYMENT',
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'OUT_FOR_DELIVERY',
      'ARRIVED',
      'DELIVERED',
      'CANCELLED'
    ],
    default: 'PENDING_PAYMENT',
    index: true
  },
  status: { type: String, default: 'Pending Payment' },

  // Payment Tracking
  paymentMethod: { type: String, default: 'razorpay' },
  paymentStatus: {
    type: String,
    enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'],
    default: 'PENDING',
    index: true
  },
  razorpayOrderId: { type: String, default: '', index: true },
  razorpayPaymentId: { type: String, default: '', index: true },
  razorpaySignature: { type: String, default: '' },

  // Handover PIN Security
  deliveryPin: { type: String, default: '' },
  pinAttempts: { type: Number, default: 0 },
  pinLockedUntil: { type: Date, default: null },

  // Cold Box & Reusable Logistics
  coolerId: { type: String, default: null, index: true },
  coolerModel: { type: String, default: null },
  coldBoxRefundStatus: {
    type: String,
    enum: ['NOT_REQUESTED', 'REQUESTED', 'APPROVED', 'REFUNDED', 'REJECTED'],
    default: 'NOT_REQUESTED',
    index: true
  },
  refundId: { type: String, default: '' },
  refundAmount: { type: Number, default: 0 },
  refundProcessedAt: { type: Date, default: null },

  // Fleet & Partner Assignments
  riderId: { type: String, default: null, index: true },
  riderFullName: { type: String, default: null },
  riderName: { type: String, default: null },
  riderPhone: { type: String, default: null },
  riderVehicle: { type: String, default: null },
  deliveryExecutive: { type: String, default: null },
  partnerId: { type: String, default: null, index: true },
  partnerName: { type: String, default: null },

  // Cold Chain Telemetry
  liveTemp: { type: Number, default: 0.8 },
  tempLog: [tempLogSchema],
  trackingCode: { type: String, default: '' },
  lifecycleTimestamps: {
    confirmedAt: { type: String, default: null },
    assignedAt: { type: String, default: null },
    preparingAt: { type: String, default: null },
    outForDeliveryAt: { type: String, default: null },
    arrivedAt: { type: String, default: null },
    deliveredAt: { type: String, default: null },
    coolerReturnedAt: { type: String, default: null }
  }
}, {
  timestamps: true,
  strict: true
});

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ riderId: 1, orderStatus: 1 });
orderSchema.index({ partnerId: 1, orderStatus: 1 });
orderSchema.index({ createdAt: -1 });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
