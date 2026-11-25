import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email or phone is required').max(150),
  password: z.string().min(1, 'Password is required')
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  upiId: z.string().optional()
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(20).optional(),
  address: z.string().max(300).optional(),
  city: z.string().max(100).optional(),
  upiId: z.string().max(100).optional(),
  savedAddresses: z.array(z.any()).optional()
}).strict();

export const riderRegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
  address: z.string().optional(),
  vehicleType: z.string().optional(),
  vehicleNumber: z.string().optional(),
  licenseNumber: z.string().optional(),
  upiId: z.string().optional()
});

export const partnerRegisterSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(10).max(15),
  password: z.string().min(6),
  address: z.string().optional(),
  shopName: z.string().min(2).max(150),
  shopAddress: z.string().optional(),
  fssaiNumber: z.string().optional(),
  operatingHours: z.string().optional(),
  categories: z.array(z.string()).optional()
});

export const orderCreateSchema = z.object({
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().int().positive().max(50),
    cutTag: z.string().optional(),
    unit: z.string().optional()
  })).min(1, 'Order must contain at least 1 item'),
  deliveryAddress: z.string().min(5, 'Delivery address is required'),
  addressDetails: z.any().optional(),
  city: z.string().optional(),
  deliverySlotId: z.string().optional(),
  deliverySlot: z.string().optional(),
  deliveryNotes: z.string().max(500).optional(),
  paymentMethod: z.enum(['ONLINE', 'COD', 'WALLET', 'UPI']),
  couponCode: z.string().max(30).optional(),
  useWallet: z.boolean().optional()
});

export const riderLifecycleSchema = z.object({
  lifecycleStatus: z.string().min(1),
  pin: z.string().optional(),
  coolerReturned: z.boolean().optional(),
  podImage: z.string().optional(),
  notes: z.string().max(500).optional()
});

export const partnerOrderStatusSchema = z.object({
  status: z.string().optional(),
  lifecycleStatus: z.string().optional(),
  prepStage: z.string().optional(),
  weighedWeight: z.any().optional(),
  sealTag: z.string().optional(),
  batchLotId: z.string().optional(),
  coolerId: z.string().optional(),
  itemPrepList: z.array(z.any()).optional(),
  dressingLossLog: z.any().optional()
});

export const coolerReturnRequestSchema = z.object({
  coolerId: z.string().min(1, 'Cooler ID is required'),
  pickupSlot: z.string().optional(),
  notes: z.string().max(500).optional(),
  address: z.string().optional(),
  upiId: z.string().optional(),
  refundPreference: z.enum(['wallet', 'upi', 'original_payment']).optional()
});

export const coolerActionSchema = z.object({
  action: z.enum(['sanitize', 'flag_damage', 'flag_maintenance', 'decommission', 'recommission']),
  notes: z.string().max(500).optional()
});

export const coolerInspectionDecisionSchema = z.object({
  inspectorNotes: z.string().max(500).optional(),
  refundAmount: z.number().nonnegative().optional(),
  refundPreference: z.enum(['wallet', 'upi', 'original_payment']).optional(),
  upiId: z.string().optional()
});

export const contactMessageSchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(10).max(20),
  message: z.string().min(5).max(2000),
  email: z.string().email().optional().or(z.literal('')),
  category: z.string().max(50).optional(),
  orderId: z.string().max(50).optional().nullable()
});

export const partnerStockUpdateSchema = z.object({
  stock: z.number().int().nonnegative('Stock cannot be negative'),
  price: z.number().positive().optional()
});

export const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const parsed = schema.parse(req[source]);
    req[source] = parsed;
    next();
  } catch (err) {
    if (err && err.errors) {
      return res.status(400).json({
        error: 'Validation failed',
        details: err.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
    return res.status(400).json({ error: 'Malformed request payload' });
  }
};
