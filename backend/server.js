import {
  ORDER_LIFECYCLE,
  isValidTransition,
  canRoleExecuteTransition,
  normalizeLifecycle
} from './services/orderStateMachine.js';
import {
  riderLifecycleSchema,
  partnerOrderStatusSchema,
  coolerActionSchema,
  coolerInspectionDecisionSchema,
  validate
} from './validators/schemas.js';
import {
  cancelOrder
} from './services/orderService.js';
import {
  validateProductionEnv,
  getJwtSecret,
  createToken,
  authenticate,
  authenticateOptional,
  requireAdmin,
  requireRole,
  requireApproved,
  setAuthCookie,
  clearAuthCookie
} from './services/auth.js';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { db } from './db.js';
import { connectMongoDB, getMongoStatus } from './mongo.js';
import { assignFleetRiderForOrder } from './dispatch.js';
import whatsappWebhookRouter from './routes/whatsappWebhook.js';
import paymentsRouter from './routes/payments.js';
import analyticsRouter from './routes/analytics.js';
import couponsRouter from './routes/coupons.js';
import deliveryRouter from './routes/delivery.js';
import { handleGoogleAuth } from './routes/googleAuth.js';
import crypto from 'crypto';
import { calculateOrderPricing } from './services/pricingService.js';
import { recordCouponUsage } from './services/couponService.js';
import { deductStock, releaseStock } from './services/stockService.js';
import { Order } from './models/Order.js';
import { User, normalizePhone } from './models/User.js';
import { Cooler } from './models/Cooler.js';
import { Product } from './models/Product.js';
import { Refund } from './models/Refund.js';
import { CashDeposit } from './models/CashDeposit.js';
import { getRefundQueue, processOrderRefund, checkRefundStatus } from './services/refundService.js';
import { debitWallet, creditWallet } from './services/walletService.js';
import { reserveDeliverySlot, releaseDeliverySlot, getAvailableDeliverySlots } from './services/deliverySlotService.js';
import { createBackup } from './scripts/backup.js';
import {
  findCooler,
  getTemperatureCheck,
  getFleetDetails,
  calculateHealthScore,
  generateFleetHealthOverview
} from './services/coolerHealthAnalytics.js';
import {
  findUser,
  findUserById,
  findUsers,
  createUser,
  updateUser,
  findProducts,
  findProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  findOrders,
  findOrderById,
  findOrder,
  createOrder,
  updateOrder,
  findCoolers,
  findCoolerById,
  createCooler,
  updateCooler,
  findCoolerReturns,
  findCoolerReturnById,
  createCoolerReturn,
  updateCoolerReturn,
  findContacts,
  createContact
} from './services/dataAccess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

validateProductionEnv();

const app = express();
const PORT = process.env.PORT || 5000;

process.on('uncaughtException', (err) => {
  console.error('[Server Error: Uncaught Exception]:', err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server Error: Unhandled Rejection]:', reason?.message || reason);
});

// Initiate MongoDB connection asynchronously (never block startup; never syncWithMongo to memory)
connectMongoDB();

// ==========================================
// SECURITY HARDENING (OWASP & Production Guardrails)
// ==========================================

// Enable reverse proxy trust for Vercel/Cloudflare headers
app.set('trust proxy', 1);

// 1. Hide server fingerprint
app.disable('x-powered-by');

// 2. Comprehensive Security Headers with Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Allows inline assets, fonts & map tiles to load seamlessly
  crossOriginEmbedderPolicy: false,
  xContentTypeOptions: true,
  xDnsPrefetchControl: { allow: false },
  xFrameOptions: { action: 'sameorigin' },
  xXssProtection: true
}));

// 3. Environment-Based Whitelisted Cross-Origin Resource Sharing (CORS) Configuration
const defaultOrigins = [
  'https://brisketbox.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:5000'
];
const envOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultOrigins;

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    const isVercelPreview = /^https:\/\/.*brisketbox.*\.vercel\.app$/.test(origin);
    if (isVercelPreview) {
      return callback(null, true);
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-guest-token']
}));

// 4. Rate limiting on all API routes
const isTest = process.env.NODE_ENV === 'test';

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 50000 : 500,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  message: { error: 'Too many requests from this IP address. Please try again in 15 minutes.' }
});
app.use('/api', generalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 50000 : 30,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  message: { error: 'Too many login attempts. For security, please wait 15 minutes before trying again.' }
});

const pinLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isTest ? 50000 : 5,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  message: { error: 'Too many PIN verification attempts. Please wait 5 minutes before trying again.' }
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 50000 : 20,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false, default: false },
  message: { error: 'Too many contact messages submitted. Please try again later.' }
});

// 5. Body parser with Raw body retention for cryptographic Webhook signature verification
app.use(express.json({
  limit: '2mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Ensure MongoDB connection is established for serverless / cold-start requests
if (process.env.VERCEL || (process.env.NODE_ENV === 'production' && process.env.NODE_ENV !== 'test')) {
  app.use(async (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
      try {
        await connectMongoDB();
      } catch (e) {
        // Handled downstream by ensureOnline or error handler
      }
    }
    next();
  });
}

// Serve frontend static assets (for monolith build)
const clientDist = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// 7. Mount specialized sub-routers
app.use('/api/payments', paymentsRouter);
app.use('/api/whatsapp', whatsappWebhookRouter);
app.use('/api/analytics', authenticate, requireAdmin, analyticsRouter);
app.use('/api/coupons', couponsRouter);
app.use('/api/delivery', deliveryRouter);

// Cold-chain telemetry route for IoT gateway
app.post('/api/iot/coldchain-ping', (req, res) => {
  const { coolerId, boxId, temp, temperature, battery, lat, lng, secretKey } = req.body;
  const expectedKey = process.env.IOT_SECRET_KEY || 'bb_iot_sensor_secret_2026';
  if (secretKey && secretKey !== expectedKey) {
    return res.status(403).json({ error: 'Unauthorized sensor gateway' });
  }

  const id = coolerId || boxId || 'BOX-BLR-001';
  const recordedTemp = Number(temp || temperature || 1.8);
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const isCompliant = recordedTemp >= 0.0 && recordedTemp <= 4.0;
  res.json({
    success: true,
    coolerId: id,
    recordedTemp,
    isCompliant,
    recordedAt: now.toISOString(),
    status: isCompliant ? 'COLD_CHAIN_NORMAL' : 'TEMPERATURE_BREACH_ALERT'
  });
});

// Health & Database Status check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', name: 'BrisketBox API', uptime: process.uptime() });
});

app.get('/api/db/status', async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    try {
      await connectMongoDB();
    } catch (e) {}
  }
  const [products, orders, coolers, users, returns] = await Promise.all([
    findProducts(),
    findOrders(),
    findCoolers(),
    findUsers(),
    findCoolerReturns()
  ]);
  res.json({
    database: 'MongoDB',
    engine: 'Mongoose ODM',
    ...getMongoStatus(),
    cachedStats: {
      products: products.length,
      orders: orders.length,
      coolers: coolers.length,
      users: users.length,
      returns: returns.length
    }
  });
});

app.get('/api/stats', async (req, res) => {
  const [products, orders, coolers, users, returns] = await Promise.all([
    findProducts(),
    findOrders(),
    findCoolers(),
    findUsers(),
    findCoolerReturns()
  ]);
  res.json({
    products: products.length,
    orders: orders.length,
    coolers: coolers.length,
    users: users.length,
    returns: returns.length
  });
});

app.get('/api', (req, res) => {
  res.json({ status: 'ok', name: 'BrisketBox API', uptime: process.uptime() });
});

// ==========================================
// 1. AUTHENTICATION (Google OAuth 2.0 & Email/Password)
// ==========================================

// Google Sign-In & Sign-Up endpoint with official Google token verification
app.post('/api/auth/google', authLimiter, async (req, res, next) => {
  try {
    await handleGoogleAuth(req, res, createToken);
  } catch (err) {
    console.error('[Google Auth Route Crash]:', err);
    res.status(500).json({ error: 'Google authentication service initializing. Please try again.' });
  }
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { name, email, password, phone, address, city, upiId } = req.body || {};
    if (!name || !email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Valid name, email, and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await findUser({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const newUser = {
      id: `usr_${uuidv4().slice(0, 8)}`,
      name: String(name).trim(),
      email: cleanEmail,
      password: bcrypt.hashSync(String(password), 10),
      role: 'customer',
      phone: typeof phone === 'string' && phone.trim() ? normalizePhone(phone) : '',
      city: typeof city === 'string' ? city : 'Bengaluru',
      address: typeof address === 'string' ? address : '1st Cross, Indiranagar, Bengaluru, Karnataka 560038',
      depositBalance: 0,
      upiId: typeof upiId === 'string' ? upiId : '',
      createdAt: new Date().toISOString()
    };

    await createUser(newUser);
    const token = createToken(newUser);
    const { password: _, ...userWithoutPw } = newUser;
    res.status(201).json({ user: userWithoutPw, token });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Registration failed' });
  }
});

// Standard Login supporting Email or Mobile number
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const input = (typeof email === 'string' ? email : '').toLowerCase().trim();
    if (!input || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Please enter your email or mobile number, and password' });
    }

    const cleanPhone = input.replace(/[^0-9]/g, '');
    let user = await findUser({ email: input });
    if (!user && cleanPhone.length >= 10) {
      const users = await findUsers();
      user = users.find(u => {
        if (!u.phone) return false;
        const uPhoneClean = String(u.phone).replace(/[^0-9]/g, '');
        return uPhoneClean.endsWith(cleanPhone) || cleanPhone.endsWith(uPhoneClean);
      });
    }

    const isPwMatch = Boolean(user && user.password && bcrypt.compareSync(password, user.password));
    if (!user || !isPwMatch) {
      return res.status(401).json({ error: 'Invalid credentials. Please verify your email/phone and password.' });
    }

    const token = createToken(user);
    setAuthCookie(res, token);
    const { password: _, ...userWithoutPw } = user;
    res.json({ user: userWithoutPw, token });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Login failed' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out successfully' });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const { password: _, ...userWithoutPw } = req.user;
  const activeCoolers = await findCoolers({ currentUserId: req.user.id });
  res.json({
    ...userWithoutPw,
    activeCoolersCount: activeCoolers.length,
    activeCoolers
  });
});

app.patch('/api/auth/profile', authenticate, async (req, res) => {
  const { name, phone, address, city, upiId, savedAddresses } = req.body;
  const updates = {};
  if (name) updates.name = name;
  if (phone) updates.phone = phone;
  if (address) updates.address = address;
  if (city) updates.city = city;
  if (upiId) updates.upiId = upiId;
  if (savedAddresses) updates.savedAddresses = savedAddresses;

  const updated = await updateUser(req.user.id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { password: _, ...safeUser } = updated;
  res.json(safeUser);
});

// ==========================================
// 2. PRODUCTS
// ==========================================

app.get('/api/products', async (req, res) => {
  const { category, search } = req.query;
  let products = await findProducts();

  if (search) {
    const q = search.toLowerCase().trim();
    products = products.filter(p =>
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.category && p.category.toLowerCase().includes(q)) ||
      (p.cutStyle && p.cutStyle.toLowerCase().includes(q)) ||
      (p.description && p.description.toLowerCase().includes(q)) ||
      (p.origin && p.origin.toLowerCase().includes(q)) ||
      (p.chillingMethod && p.chillingMethod.toLowerCase().includes(q))
    );
  } else if (category && category !== 'All') {
    products = products.filter(p => (p.category || '').toLowerCase() === category.toLowerCase());
  }

  res.json(products);
});

app.get('/api/products/:id', async (req, res) => {
  const product = await findProductById(req.params.id);
  if (!product) {
    return res.status(404).json({ error: 'Cut not found in inventory' });
  }
  res.json(product);
});

app.post('/api/products', authenticate, requireAdmin, async (req, res) => {
  const { name, category, description, price, mrp, unit, netWeight, grossWeight, pieces, serves, chillingMethod, catchDate, origin, cutStyle, stock, image } = req.body;
  if (!name || !price || !category) {
    return res.status(400).json({ error: 'Name, price, and category are required' });
  }

  const newProduct = {
    id: `prod_${Date.now()}`,
    name,
    category,
    description: description || 'Daily fresh dressed cut chilled for delivery.',
    price: parseInt(price, 10),
    mrp: parseInt(mrp || price, 10),
    unit: unit || '500g',
    netWeight: netWeight || '450g',
    grossWeight: grossWeight || '500g',
    pieces: pieces || '4-6 Pieces',
    serves: serves || 'Serves 2-3',
    eta: 'Today',
    chillingMethod: chillingMethod || 'Chilled Cold Chain',
    catchDate: catchDate || 'Morning Catch',
    origin: origin || 'Direct Sourcing',
    cutStyle: cutStyle || 'Butcher Fresh Cut',
    stock: parseInt(stock, 10) || 25,
    image: image || '/images/products/prod_1.webp',
    sealed: true,
    inStock: true
  };

  const created = await createProduct(newProduct);
  res.status(201).json(created);
});

app.put('/api/products/:id', authenticate, requireAdmin, async (req, res) => {
  const updates = req.body;
  const updated = await updateProduct(req.params.id, updates);
  if (!updated) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json(updated);
});

app.delete('/api/products/:id', authenticate, requireAdmin, async (req, res) => {
  const deleted = await deleteProduct(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Product not found' });
  }
  res.json({ success: true, message: 'Cut removed from active catalog' });
});

// ==========================================
// 3. ORDERS
// ==========================================

app.post('/api/orders', authenticate, async (req, res) => {
  const {
    items,
    deliveryAddress,
    city,
    paymentMethod = 'cash',
    deliverySlot,
    deliveryNotes,
    couponCode,
    useWallet = false
  } = req.body;

  let pricing;
  try {
    pricing = await calculateOrderPricing({
      items,
      couponCode,
      user: req.user,
      useWallet,
      tipAmount: req.body?.tipAmount
    });
  } catch (priceErr) {
    return res.status(400).json({ error: priceErr.message });
  }

  const {
    processedItems,
    subtotal,
    discountAmount,
    shippingFee,
    coolerDeposit,
    walletDeduction,
    netPayable
  } = pricing;

  // Real Delivery Slot: Atomic reservation & validation based on India time (Asia/Kolkata)
  let reservedSlot = null;
  try {
    if (deliverySlot) {
      const slotRes = await reserveDeliverySlot(deliverySlot);
      reservedSlot = slotRes.slot;
    } else {
      const { nextAvailableSlot } = await getAvailableDeliverySlots();
      if (!nextAvailableSlot) {
        return res.status(400).json({ error: 'No delivery slots are currently available. Please select another slot.' });
      }
      const slotRes = await reserveDeliverySlot(nextAvailableSlot.id);
      reservedSlot = slotRes.slot;
    }
  } catch (slotErr) {
    return res.status(400).json({ error: slotErr.message });
  }

  const assignedDeliverySlot = reservedSlot ? reservedSlot.label : (deliverySlot || 'Today, Express Delivery');

  // Deduct inventory atomically
  try {
    await deductStock(processedItems);
  } catch (stockErr) {
    if (reservedSlot?.id) await releaseDeliverySlot(reservedSlot.id);
    return res.status(409).json({ error: stockErr.message });
  }

  const orderNumber = `BB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const deliveryPin = crypto.randomInt(1000, 10000).toString();

  // If wallet deduction used, execute atomic ledger debit
  if (walletDeduction > 0) {
    try {
      await debitWallet({
        userId: req.user.id,
        amount: walletDeduction,
        idempotencyKey: `wallet_order_${orderNumber}_debit`,
        orderId: orderNumber,
        title: `Payment for #${orderNumber}`,
        description: `Store credit used for Order #${orderNumber}`
      });
    } catch (walletErr) {
      if (reservedSlot?.id) await releaseDeliverySlot(reservedSlot.id);
      await releaseStock(processedItems);
      return res.status(400).json({ error: walletErr.message });
    }
  }

  if (couponCode) {
    await recordCouponUsage(couponCode, req.user, orderNumber);
  }

  const availableCoolers = await findCoolers({ status: 'available' });
  const assignedCooler = availableCoolers[0] || null;
  if (assignedCooler) {
    await updateCooler(assignedCooler.id, {
      status: 'assigned',
      currentOrderId: orderNumber,
      currentUserId: req.user.id,
      currentUserName: req.user.name
    });
  }

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const assignedRider = await assignFleetRiderForOrder();

  const order = {
    id: orderNumber,
    orderNumber,
    deliveryPin,
    userId: req.user.id,
    customerName: req.user.name,
    customerEmail: req.user.email,
    customerPhone: req.user.phone ? normalizePhone(req.user.phone) : '',
    deliveryAddress: deliveryAddress || req.user.address || 'Address provided at checkout',
    city: city || req.user.city || '',
    items: processedItems,
    subtotal,
    discountAmount,
    couponCode: couponCode || null,
    coolerDeposit,
    shippingFee,
    tipAmount: pricing.tipAmount,
    walletDeduction,
    stockDeducted: true,
    total: netPayable,
    totalAmount: netPayable,
    status: 'Preparing',
    orderStatus: 'CONFIRMED',
    lifecycleStatus: 'CONFIRMED',
    partnerId: null,
    partnerName: null,
    paymentMethod: walletDeduction > 0 ? `Wallet (₹${walletDeduction}) + ${paymentMethod.toUpperCase()}` : paymentMethod,
    paymentStatus: netPayable === 0 ? 'PAID' : 'PENDING',
    coolerId: assignedCooler?.id || null,
    coolerModel: assignedCooler?.model || null,
    coldBoxRefundStatus: 'NOT_REQUESTED',
    liveTemp: null,
    riderId: assignedRider?.riderId || null,
    riderFullName: assignedRider?.riderFullName || null,
    riderName: assignedRider?.riderName || null,
    riderPhone: assignedRider?.riderPhone || null,
    riderVehicle: assignedRider?.riderVehicle || null,
    deliveryExecutive: assignedRider?.deliveryExecutive || null,
    lifecycleTimestamps: {
      confirmedAt: now.toISOString(),
      assignedAt: now.toISOString()
    },
    tempLog: [],
    deliverySlot: assignedDeliverySlot,
    trackingCode: `BB-TRK-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    pinAttempts: 0,
    pinLockedUntil: null,
    createdAt: new Date().toISOString(),
    deliveryNotes: deliveryNotes || ''
  };

  await createOrder(order);
  res.status(201).json(order);
});

// Helper to format consistent privacy-preserving assigned rider details
function sanitizeAssignedRider(order) {
  if (!order) return null;
  if (order.riderId) {
    const fullName = order.riderFullName || order.riderName || 'Assigned Fleet Rider';
    return {
      fullName,
      firstName: fullName.split(' ')[0],
      riderId: order.riderId ? `RD-${order.riderId.slice(-4).toUpperCase()}` : 'RD-FLEET',
      vehicle: order.riderVehicle || null,
      status: order.lifecycleStatus || order.status || 'Rider Assigned',
      estimatedArrival: order.riderEta || null,
      maskedPhone: order.riderPhone ? `${order.riderPhone.slice(0, 8)} •••${order.riderPhone.slice(-2)}` : '',
      secureCall: true,
      profilePhoto: order.riderAvatar || null
    };
  } else if (order.riderName || order.riderFullName || order.deliveryExecutive) {
    const cleanExec = order.deliveryExecutive ? order.deliveryExecutive.replace(/\s*\([^)]*\)/g, '').trim() : '';
    const fullName = order.riderFullName || cleanExec || order.riderName || 'Assigned Fleet Rider';
    return {
      fullName,
      firstName: fullName.split(' ')[0],
      riderId: 'RD-FLEET',
      vehicle: order.riderVehicle || null,
      status: order.lifecycleStatus || order.status || 'Rider Assigned',
      estimatedArrival: order.riderEta || null,
      maskedPhone: order.riderPhone ? `${order.riderPhone.slice(0, 8)} •••${order.riderPhone.slice(-2)}` : '',
      secureCall: true,
      profilePhoto: order.riderAvatar || null
    };
  }
  return null;
}

app.get('/api/orders', authenticate, async (req, res) => {
  let filter = {};
  if (req.user.role === 'admin') {
    // Admin can view all orders
  } else if (req.user.role === 'customer') {
    filter = { userId: req.user.id };
  } else if (req.user.role === 'rider') {
    filter = { riderId: req.user.id, orderStatus: { $ne: 'PENDING_PAYMENT' } };
  } else if (req.user.role === 'partner') {
    filter = {
      $or: [{ partnerId: req.user.shopId }, { partnerId: req.user.id }],
      orderStatus: { $ne: 'PENDING_PAYMENT' }
    };
  } else {
    return res.json([]);
  }

  const orders = await findOrders(filter);
  const sanitized = orders.map(o => {
    const { deliveryPin, ...safeOrder } = o;
    return {
      ...safeOrder,
      assignedRider: sanitizeAssignedRider(o)
    };
  });
  res.json(sanitized);
});

app.get('/api/orders/:id', authenticate, async (req, res) => {
  const order = await findOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const isOwnerCustomer = req.user.role === 'customer' && order.userId === req.user.id;
  const isAssignedRider = req.user.role === 'rider' && order.riderId === req.user.id;
  const isAssignedPartner = req.user.role === 'partner' && (order.partnerId === req.user.shopId || order.partnerId === req.user.id);
  const isAdmin = req.user.role === 'admin';

  if (!isOwnerCustomer && !isAssignedRider && !isAssignedPartner && !isAdmin) {
    return res.status(403).json({ error: 'Access denied: You do not own or manage this order' });
  }

  const cooler = order.coolerId ? await findCoolerById(order.coolerId) : null;
  const { deliveryPin, ...safeOrder } = order;

  if (isOwnerCustomer) {
    safeOrder.deliveryPin = deliveryPin;
  }

  res.json({
    ...safeOrder,
    coolerDetails: cooler,
    assignedRider: sanitizeAssignedRider(order)
  });
});

// ==========================================
// 4A. RIDER ECOSYSTEM ENDPOINTS
// ==========================================

app.post('/api/rider/register', authLimiter, async (req, res) => {
  try {
    const { name, email, phone, password, address, vehicleType, vehicleNumber, licenseNumber, upiId } = req.body || {};
    if (!name || !email || !password || !phone || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Valid name, email, phone, and password strings are required for rider onboarding' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await findUser({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const newRider = {
      id: `usr_rider_${uuidv4().slice(0, 6)}`,
      name: String(name).trim(),
      email: cleanEmail,
      phone: String(phone),
      password: bcrypt.hashSync(String(password), 10),
      role: 'rider',
      approvalStatus: 'pending_approval',
      address: typeof address === 'string' ? address : 'Bengaluru',
      vehicleType: typeof vehicleType === 'string' ? vehicleType : 'Electric 2-Wheeler (EV)',
      vehicleNumber: typeof vehicleNumber === 'string' ? vehicleNumber : 'KA-04-EV-TEMP',
      licenseNumber: typeof licenseNumber === 'string' ? licenseNumber : 'DL-TEMP-PENDING',
      upiId: typeof upiId === 'string' ? upiId : `${cleanPhone.slice(-10)}@okaxis`,
      online: false,
      earningsToday: 0,
      deliveriesToday: 0,
      rating: 4.9,
      createdAt: new Date().toISOString()
    };

    await createUser(newRider);
    const { password: _, ...safeRider } = newRider;
    res.status(201).json({
      message: 'Rider registration submitted. Your application is under review by Operations.',
      rider: safeRider
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Rider registration failed' });
  }
});

app.post('/api/rider/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const input = (typeof email === 'string' ? email : '').toLowerCase().trim();
    if (!input || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Rider email/phone and password required' });
    }

    const cleanDigits = input.replace(/[^0-9]/g, '');
    let user = await findUser({ email: input });
    if (!user && cleanDigits.length >= 10) {
      const riders = await findUsers({ role: 'rider' });
      user = riders.find(u => u.phone && String(u.phone).replace(/[^0-9]/g, '').endsWith(cleanDigits));
    }

    const isPwMatch = Boolean(user && user.password && bcrypt.compareSync(password, user.password));
    if (!user || !isPwMatch) {
      return res.status(401).json({ error: 'Invalid credentials. Please verify your rider credentials.' });
    }

    if (user.role !== 'rider' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: This login is exclusively for BrisketBox Delivery Riders.' });
    }

    if (user.approvalStatus === 'pending_approval') {
      return res.status(403).json({
        error: 'Your rider application is currently Pending Approval from the Operations Admin.',
        approvalStatus: 'pending_approval'
      });
    }

    if (user.approvalStatus === 'rejected') {
      return res.status(403).json({
        error: 'Your rider application was not approved by Operations.',
        approvalStatus: 'rejected'
      });
    }

    if (user.approvalStatus === 'suspended') {
      return res.status(403).json({
        error: 'Your rider partner account is currently suspended.',
        approvalStatus: 'suspended'
      });
    }

    const token = createToken(user);
    const { password: _, ...userWithoutPw } = user;
    res.json({ user: userWithoutPw, token });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Rider login failed' });
  }
});

app.get('/api/rider/me', authenticate, requireRole('rider'), (req, res) => {
  const { password: _, ...safeRider } = req.user;
  res.json(safeRider);
});

app.patch('/api/rider/status', authenticate, requireRole('rider'), requireApproved, async (req, res) => {
  const { online } = req.body;
  const updated = await updateUser(req.user.id, { online: !!online });
  const { password: _, ...safeRider } = updated;
  res.json(safeRider);
});

app.get('/api/rider/orders', authenticate, requireRole('rider'), requireApproved, async (req, res) => {
  const assigned = await findOrders({ riderId: req.user.id });
  res.json(assigned);
});

app.patch('/api/rider/orders/:id/lifecycle', authenticate, requireRole('rider'), requireApproved, pinLimiter, validate(riderLifecycleSchema), async (req, res) => {
  const { lifecycleStatus, pin, coolerReturned, podImage, notes } = req.body;
  const order = await findOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  // Ensure rider can only update their own assigned order
  if (req.user.role !== 'admin' && order.riderId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You are not the assigned rider for this order' });
  }

  // State machine validation
  const targetStatus = normalizeLifecycle(lifecycleStatus);
  if (!isValidTransition(order.lifecycleStatus, targetStatus)) {
    return res.status(400).json({
      error: `Invalid lifecycle transition from '${order.lifecycleStatus || order.status}' to '${targetStatus}'.`
    });
  }

  if (!canRoleExecuteTransition('rider', order.lifecycleStatus, targetStatus)) {
    return res.status(403).json({
      error: `Riders are not authorized to transition order to '${targetStatus}'.`
    });
  }

  // PIN check when completing delivery
  if (targetStatus === ORDER_LIFECYCLE.DELIVERED) {
    if (!pin || String(pin).trim() !== String(order.deliveryPin).trim()) {
      return res.status(400).json({ error: 'Invalid delivery verification PIN. Please request the 4-digit PIN from the customer.' });
    }
  }

  if (order.riderId && order.riderId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You are not assigned to this delivery run' });
  }

  if (lifecycleStatus === 'DELIVERED') {
    return handleOrderHandover(req, res);
  }

  const nowIso = new Date().toISOString();
  const timestamps = { ...(order.lifecycleTimestamps || {}) };

  let statusLabel = order.status;
  let targetOrderStatus = order.orderStatus;
  if (lifecycleStatus === 'PICKED_UP') {
    timestamps.pickedUpAt = timestamps.pickedUpAt || nowIso;
    statusLabel = 'Picked Up from Hub';
    targetOrderStatus = 'READY_FOR_PICKUP';
  } else if (lifecycleStatus === 'OUT_FOR_DELIVERY') {
    timestamps.outForDeliveryAt = timestamps.outForDeliveryAt || nowIso;
    statusLabel = 'Out for Delivery';
    targetOrderStatus = 'OUT_FOR_DELIVERY';
  } else if (lifecycleStatus === 'ARRIVED') {
    timestamps.arrivedAt = timestamps.arrivedAt || nowIso;
    statusLabel = 'Arrived at Customer Doorstep';
    targetOrderStatus = 'ARRIVED';
  } else if (lifecycleStatus === 'COOLER_RETURNED') {
    timestamps.coolerReturnedAt = timestamps.coolerReturnedAt || nowIso;
    statusLabel = 'Cooler Returned';
  }

  const updates = {
    orderStatus: targetOrderStatus,
    lifecycleStatus: lifecycleStatus || order.lifecycleStatus,
    status: statusLabel,
    riderId: req.user.id,
    riderName: req.user.name.split(' ')[0],
    riderFullName: req.user.name,
    riderPhone: req.user.phone ? normalizePhone(req.user.phone) : '',
    riderVehicle: req.user.vehicleType ? `${req.user.vehicleType} (${req.user.vehicleNumber || ''})` : 'EV 2-Wheeler',
    lifecycleTimestamps: timestamps
  };

  if (coolerReturned) {
    updates.coolerReturned = true;
    timestamps.coolerReturnedAt = timestamps.coolerReturnedAt || nowIso;
  }

  const updatedOrder = await updateOrder(order.id, updates);
  res.json(updatedOrder);
});

// Cold-chain compliance scan per analytical-scripts/cooler_health.py
app.post('/api/rider/cooler-check', authenticate, requireRole('rider'), requireApproved, async (req, res) => {
  const { coolerId, orderId } = req.body;
  if (!coolerId) {
    return res.status(400).json({ error: 'Cooler ID is required' });
  }

  const order = orderId ? await findOrderById(orderId) : null;
  const logs = order?.tempLog || order?.temperatureLog || [];
  
  const outOfRange = logs.filter(r => typeof r.temp === 'number' && (r.temp < 0.0 || r.temp > 4.0));
  const isColdChainMaintained = outOfRange.length === 0;
  const finalTemp = logs.length > 0 && typeof logs[logs.length - 1].temp === 'number'
    ? logs[logs.length - 1].temp 
    : (order?.liveTemp ?? null);

  const stage = isColdChainMaintained ? 'GOOD' : 'CRITICAL';
  const refundApproved = isColdChainMaintained;
  const actualDeposit = Number(order?.coolerDeposit || 0);
  const refundAmount = refundApproved ? actualDeposit : 0;

  res.json({
    coolerId,
    orderId: order?.id || null,
    stage,
    isColdChainMaintained,
    finalTemp,
    outOfRangeCount: outOfRange.length,
    refundApproved,
    refundAmount,
    message: refundApproved
      ? (finalTemp !== null 
          ? `Cold-chain maintained at ${finalTemp}°C. ₹${refundAmount} security deposit approved for instant refund.`
          : `Temperature not recorded. ₹${refundAmount} security deposit approved for instant refund.`)
      : `Temperature breach detected (${outOfRange.map(o => `${o.temp}°C at ${o.time}`).join(', ')}). Retained for hub audit.`
  });
});

// ==========================================
// 4B. BUTCHER / PARTNER SHOP ENDPOINTS
// ==========================================

app.post('/api/partner/register', authLimiter, async (req, res) => {
  try {
    const { shopName, ownerName, email, phone, password, address, fssaiNumber, categories, operatingHours, description } = req.body || {};
    if (!shopName || !ownerName || !email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Valid shop name, owner name, email, and password strings are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = await findUser({ email: cleanEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const shopId = `shop_${uuidv4().slice(0, 8)}`;
    const newPartner = {
      id: `usr_partner_${uuidv4().slice(0, 6)}`,
      name: String(ownerName).trim(),
      shopName: String(shopName).trim(),
      shopId,
      email: cleanEmail,
      phone: typeof phone === 'string' ? phone : '+91 98000 00000',
      password: bcrypt.hashSync(String(password), 10),
      role: 'partner',
      approvalStatus: 'pending_approval',
      address: typeof address === 'string' ? address : 'Bengaluru Depot',
      fssaiNumber: typeof fssaiNumber === 'string' ? fssaiNumber : '',
      categories: Array.isArray(categories) ? categories : ['Fresh Chicken', 'Tender Mutton', 'Fish & Seafood'],
      operatingHours: typeof operatingHours === 'string' ? operatingHours : '05:30 AM - 09:30 PM',
      description: typeof description === 'string' ? description : 'Butcher station & seafood hub',
      createdAt: new Date().toISOString()
    };

    await createUser(newPartner);
    const { password: _, ...safePartner } = newPartner;
    res.status(201).json({
      message: 'Partner shop application submitted successfully. Pending Admin verification.',
      partner: safePartner
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Partner registration failed' });
  }
});

app.post('/api/partner/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const input = (typeof email === 'string' ? email : '').toLowerCase().trim();
    if (!input || !password || typeof password !== 'string') {
      return res.status(400).json({ error: 'Partner business email and password required' });
    }

    const cleanDigits = input.replace(/[^0-9]/g, '');
    let user = await findUser({ email: input });
    if (!user && cleanDigits.length >= 10) {
      const partners = await findUsers({ role: 'partner' });
      user = partners.find(u => u.phone && String(u.phone).replace(/[^0-9]/g, '').endsWith(cleanDigits));
    }

    const isPwMatch = Boolean(user && user.password && bcrypt.compareSync(password, user.password));
    if (!user || !isPwMatch) {
      return res.status(401).json({ error: 'Invalid credentials. Please verify your shop partner login.' });
    }

    if (user.role !== 'partner' && user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: This login is exclusively for Butcher / Partner Shops.' });
    }

    if (user.approvalStatus === 'pending_approval') {
      return res.status(403).json({
        error: 'Your partner shop application is currently Pending Approval from BrisketBox Operations Admin.',
        approvalStatus: 'pending_approval'
      });
    }

    if (user.approvalStatus === 'suspended') {
      return res.status(403).json({
        error: 'Your shop partner account is currently suspended.',
        approvalStatus: 'suspended'
      });
    }

    const token = createToken(user);
    setAuthCookie(res, token);
    const { password: _, ...userWithoutPw } = user;
    res.json({ user: userWithoutPw, token });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Partner login failed' });
  }
});

app.get('/api/partner/me', authenticate, requireRole('partner'), (req, res) => {
  const { password: _, ...safePartner } = req.user;
  res.json(safePartner);
});

app.get('/api/partner/products', authenticate, requireRole('partner'), requireApproved, async (req, res) => {
  const allProds = await findProducts();
  const partnerProds = allProds.filter(p => p.partnerId === req.user.shopId || (!p.partnerId && req.user.role === 'admin'));
  res.json(partnerProds.length > 0 ? partnerProds : allProds);
});

app.post('/api/partner/products', authenticate, requireRole('partner'), requireApproved, async (req, res) => {
  const { name, category, description, price, mrp, unit, netWeight, pieces, serves, origin, cutStyle, stock, image } = req.body;
  if (!name || !price || !category) {
    return res.status(400).json({ error: 'Name, price, and category are required' });
  }

  const newProd = {
    id: `prod_${uuidv4().slice(0, 8)}`,
    partnerId: req.user.shopId || 'shop_central_butcher',
    partnerName: req.user.shopName || req.user.name,
    name,
    category,
    description: description || 'Daily fresh dressed cuts chilled for delivery.',
    price: parseInt(price, 10),
    mrp: parseInt(mrp || price, 10),
    unit: unit || '500g',
    netWeight: netWeight || '450g',
    grossWeight: '550g',
    pieces: pieces || '4-6 Pieces',
    serves: serves || 'Serves 2-3',
    eta: 'Today',
    chillingMethod: 'Chilled pack Cold Chain',
    origin: origin || 'Direct Sourcing',
    cutStyle: cutStyle || 'Butcher Fresh Cut',
    stock: parseInt(stock, 10) || 30,
    image: image || '/images/products/prod_1.webp',
    imageUrl: image || '/images/products/prod_1.webp',
    sealed: true,
    inStock: true
  };

  const created = await createProduct(newProd);
  res.status(201).json(created);
});

app.patch('/api/partner/products/:id/stock', authenticate, requireRole('partner'), requireApproved, async (req, res) => {
  const { stock, inStock } = req.body;
  const prod = await findProductById(req.params.id);
  if (!prod) return res.status(404).json({ error: 'Product not found' });

  const updates = {};
  if (typeof stock === 'number') updates.stock = stock;
  if (typeof inStock === 'boolean') updates.inStock = inStock;

  const updated = await updateProduct(prod.id, updates);
  res.json(updated);
});

app.get('/api/partner/orders', authenticate, requireRole('partner'), requireApproved, async (req, res) => {
  const partnerOrders = await findOrders({
    $or: [{ partnerId: req.user.shopId }, { partnerId: req.user.id }]
  });
  res.json(partnerOrders);
});

app.patch('/api/partner/orders/:id/status', authenticate, requireRole('partner'), requireApproved, validate(partnerOrderStatusSchema), async (req, res) => {
  const { status, lifecycleStatus, prepStage, weighedWeight, sealTag, batchLotId, coolerId, itemPrepList, dressingLossLog } = req.body;
  const order = await findOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (req.user.role !== 'admin' && order.partnerId && order.partnerId !== req.user.shopId && order.partnerId !== req.user.id) {
    return res.status(403).json({ error: 'Access denied: You are not the assigned partner shop for this order' });
  }

  const targetStatus = normalizeLifecycle(lifecycleStatus || status);
  if (!isValidTransition(order.lifecycleStatus, targetStatus)) {
    return res.status(400).json({
      error: `Invalid lifecycle transition from '${order.lifecycleStatus || order.status}' to '${targetStatus}'.`
    });
  }

  if (!canRoleExecuteTransition('partner', order.lifecycleStatus, targetStatus)) {
    return res.status(403).json({
      error: `Partner shops are not authorized to transition order to '${targetStatus}'.`
    });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const resolvedLifecycle = (lifecycleStatus === 'READY_FOR_PICKUP' || status === 'Cold Box Packed') ? 'PACKED' : (lifecycleStatus || order.lifecycleStatus || 'PREPARING');

  const timestamps = { ...(order.lifecycleTimestamps || {}) };
  if (resolvedLifecycle === 'PACKED' || status === 'Cold Box Packed') {
    timestamps.packedAt = timestamps.packedAt || nowIso;
  }

  const updates = {
    lifecycleStatus: resolvedLifecycle,
    status: status || 'Cold Box Packed',
    prepStage: prepStage || status,
    partnerId: req.user.shopId || order.partnerId,
    partnerName: req.user.shopName || req.user.name || order.partnerName,
    weighedWeight: weighedWeight || order.weighedWeight,
    sealTag: sealTag || order.sealTag,
    coolerId: coolerId || order.coolerId,
    batchLotId: batchLotId || order.batchLotId,
    butcherName: req.user.name || order.butcherName,
    itemPrepList: itemPrepList || order.itemPrepList,
    dressingLossLog: dressingLossLog || order.dressingLossLog,
    lifecycleTimestamps: timestamps
  };

  const lossText = dressingLossLog ? ` [Dressing Loss: ${dressingLossLog.lossPercent}% on ${dressingLossLog.carcassType}]` : '';
  const updatedOrder = await updateOrder(order.id, updates);
  res.json(updatedOrder);
});

// ==========================================
// 4C. ADMIN MULTI-PORTAL MANAGEMENT ENDPOINTS
// ==========================================

app.get('/api/admin/riders', authenticate, requireAdmin, async (req, res) => {
  const riders = await findUsers({ role: 'rider' });
  const safeRiders = riders.map(({ password: _, ...r }) => r);
  res.json(safeRiders);
});

app.patch('/api/admin/riders/:id/approval', authenticate, requireAdmin, async (req, res) => {
  const { approvalStatus } = req.body;
  if (!['approved', 'rejected', 'suspended', 'pending_approval'].includes(approvalStatus)) {
    return res.status(400).json({ error: 'Invalid approval status' });
  }

  const updated = await updateUser(req.params.id, { approvalStatus });
  if (!updated) return res.status(404).json({ error: 'Rider not found' });
  const { password: _, ...safeRider } = updated;
  res.json(safeRider);
});

app.get('/api/admin/partners', authenticate, requireAdmin, async (req, res) => {
  const partners = await findUsers({ role: 'partner' });
  const safePartners = partners.map(({ password: _, ...p }) => p);
  res.json(safePartners);
});

app.patch('/api/admin/partners/:id/approval', authenticate, requireAdmin, async (req, res) => {
  const { approvalStatus } = req.body;
  if (!['approved', 'rejected', 'suspended', 'pending_approval'].includes(approvalStatus)) {
    return res.status(400).json({ error: 'Invalid approval status' });
  }

  const updated = await updateUser(req.params.id, { approvalStatus });
  if (!updated) return res.status(404).json({ error: 'Partner shop not found' });
  const { password: _, ...safePartner } = updated;
  res.json(safePartner);
});

app.patch('/api/admin/orders/:id/assign', authenticate, requireAdmin, async (req, res) => {
  const { riderId, partnerId } = req.body;
  const order = await findOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const updates = {};
  if (riderId) {
    const rider = await findUserById(riderId);
    if (rider) {
      updates.riderId = rider.id;
      updates.riderName = rider.name.split(' ')[0];
      updates.riderFullName = rider.name;
      updates.riderPhone = rider.phone;
      updates.riderVehicle = rider.vehicleType ? `${rider.vehicleType} (${rider.vehicleNumber || ''})` : 'EV 2-Wheeler';
      updates.deliveryExecutive = `${rider.name} (${rider.phone || ''})`;
      updates.lifecycleStatus = 'RIDER_ASSIGNED';
      updates.orderStatus = 'OUT_FOR_DELIVERY';
      updates.status = 'Out for Delivery';
      updates.lifecycleTimestamps = {
        ...(order.lifecycleTimestamps || {}),
        assignedAt: new Date().toISOString()
      };
    }
  }

  if (partnerId) {
    const partner = await findUser({ $or: [{ shopId: partnerId }, { id: partnerId }] });
    if (partner) {
      updates.partnerId = partner.shopId || partner.id;
      updates.partnerName = partner.shopName || partner.name;
    }
  }

  const updatedOrder = await updateOrder(order.id, updates);
  res.json(updatedOrder);
});

// Database-Persistent Handover PIN Verification
const handleOrderHandover = async (req, res) => {
  const { pin, deliveryPin, coolerReturned, podImage, notes, cashCollected, cashAmount } = req.body;
  const order = await findOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const isAdmin = req.user && req.user.role === 'admin';
  const isApprovedRider = req.user && req.user.role === 'rider' && req.user.approvalStatus === 'approved';
  const isAssignedRider = isApprovedRider && Boolean(order.riderId && order.riderId === req.user.id);
  if (!isAdmin && !isAssignedRider) {
    return res.status(403).json({ error: 'Access denied: Only the assigned and approved delivery rider or operations admin can complete order handover.' });
  }

  // Handover is allowed ONLY from OUT_FOR_DELIVERY or ARRIVED
  const currentLifecycle = normalizeLifecycle(order.lifecycleStatus || order.orderStatus || order.status);
  if (!['OUT_FOR_DELIVERY', 'ARRIVED'].includes(currentLifecycle)) {
    if (['DELIVERED', 'COOLER_RETURNED', 'COMPLETED'].includes(currentLifecycle)) {
      return res.status(400).json({ 
        error: `Order has already been delivered and completed. Current status is '${currentLifecycle}'.` 
      });
    }
    return res.status(400).json({ 
      error: `Order handover is only permitted from 'OUT_FOR_DELIVERY' or 'ARRIVED' status. Current status is '${currentLifecycle}'.` 
    });
  }

  // COD Cash Validation (validate payload BEFORE consuming PIN attempts):
  // - A rider cannot choose a lower, partial, excessive, or negative cash amount.
  // - Delivery of a COD order must record exactly the server-calculated amount due.
  // - Never add cash for a prepaid order!
  const isCod = Boolean(order.paymentMethod?.toLowerCase().includes('cash') || order.paymentMethod?.toLowerCase().includes('cod'));
  const serverAmountDue = Math.round(Number(order.totalAmount || order.total || 0));

  let collectedCashNum = 0;

  if (isCod) {
    const rawCash = cashAmount !== undefined ? cashAmount : (req.body.cashCollected !== undefined ? req.body.cashCollected : serverAmountDue);
    const parsedCash = Number(rawCash);

    if (isNaN(parsedCash) || parsedCash <= 0 || Math.round(parsedCash) !== serverAmountDue) {
      return res.status(400).json({
        error: `Invalid cash amount for Cash on Delivery. Exactly the server-calculated amount due (₹${serverAmountDue}) must be recorded. Received: ${rawCash}`
      });
    }

    collectedCashNum = serverAmountDue;
  } else {
    // Prepaid orders: Never collect cash!
    if (cashAmount !== undefined && Number(cashAmount) > 0) {
      return res.status(400).json({
        error: 'Cash collection is not permitted for prepaid orders.'
      });
    }
    collectedCashNum = 0;
  }

  const enteredPin = String(pin || deliveryPin || '').trim();
  const validPin = String(order.deliveryPin || '').trim();
  const nowDate = new Date();
  const nowMs = nowDate.getTime();
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  if (validPin) {
    if (isMongo) {
      // 1. If previous lock has expired, reset pinAttempts and pinLockedUntil atomically
      await Order.updateOne(
        {
          _id: order._id,
          pinLockedUntil: { $ne: null, $lte: nowDate }
        },
        {
          $set: { pinAttempts: 0, pinLockedUntil: null }
        }
      );

      // 2. Reserve an attempt atomically BEFORE comparing the PIN
      // Condition: pinAttempts < 3 and not locked (pinLockedUntil is null or <= nowDate)
      // Only requests that win one of the 3 attempt slots may compare the PIN!
      const reservation = await Order.findOneAndUpdate(
        {
          _id: order._id,
          pinAttempts: { $lt: 3 },
          $or: [
            { pinLockedUntil: null },
            { pinLockedUntil: { $lte: nowDate } }
          ]
        },
        {
          $inc: { pinAttempts: 1 }
        },
        {
          returnDocument: 'after'
        }
      );

      // If no slot was won, order is locked or max attempts already reached!
      if (!reservation) {
        // Ensure lock timestamp is recorded if 3 attempts were consumed
        const currentDoc = await Order.findById(order._id).lean();
        if (currentDoc && (currentDoc.pinAttempts || 0) >= 3 && !currentDoc.pinLockedUntil) {
          const lockUntilDate = new Date(nowMs + 300000);
          await Order.updateOne({ _id: order._id }, { $set: { pinLockedUntil: lockUntilDate } });
        }
        const lockDate = currentDoc?.pinLockedUntil ? new Date(currentDoc.pinLockedUntil) : new Date(nowMs + 300000);
        const remainingSec = Math.max(1, Math.ceil((lockDate.getTime() - nowMs) / 1000));
        return res.status(429).json({
          error: `Handover locked due to 3 failed PIN attempts. Please wait ${remainingSec}s before retrying.`,
          locked: true,
          remainingSec
        });
      }

      // Slot won! Only NOW compare the PIN
      const attemptNum = reservation.pinAttempts; // 1, 2, or 3
      if (enteredPin !== validPin) {
        if (attemptNum >= 3) {
          const lockUntilDate = new Date(nowMs + 300000);
          await Order.updateOne({ _id: order._id }, { $set: { pinLockedUntil: lockUntilDate } });
          return res.status(429).json({
            error: '3 incorrect PIN attempts. Security lockout active for 5 minutes. Customer must verify in person.',
            locked: true,
            remainingSec: 300
          });
        }
        return res.status(400).json({
          error: `Invalid 4-digit PIN. ${3 - attemptNum} attempt(s) remaining before security lockout.`,
          remainingAttempts: 3 - attemptNum
        });
      }

      // Correct PIN matched and won a valid slot! Handover proceeds.
    } else {
      // In-memory fallback
      const currentDoc = await findOrderById(order.id);
      const isLocked = currentDoc.pinLockedUntil && new Date(currentDoc.pinLockedUntil).getTime() > nowMs;
      if (isLocked || (currentDoc.pinAttempts || 0) >= 3) {
        const lockUntilDate = currentDoc.pinLockedUntil ? new Date(currentDoc.pinLockedUntil) : new Date(nowMs + 300000);
        const remainingSec = Math.max(1, Math.ceil((lockUntilDate.getTime() - nowMs) / 1000));
        return res.status(429).json({
          error: `Handover locked due to failed PIN attempts. Please wait ${remainingSec}s before retrying.`,
          locked: true,
          remainingSec
        });
      }

      const attemptNum = (currentDoc.pinAttempts || 0) + 1;
      await updateOrder(order.id, { pinAttempts: attemptNum });

      if (enteredPin !== validPin) {
        if (attemptNum >= 3) {
          await updateOrder(order.id, { pinLockedUntil: new Date(nowMs + 300000) });
          return res.status(429).json({
            error: '3 incorrect PIN attempts. Security lockout active for 5 minutes. Customer must verify in person.',
            locked: true,
            remainingSec: 300
          });
        }
        return res.status(400).json({
          error: `Invalid 4-digit PIN. ${3 - attemptNum} attempt(s) remaining before security lockout.`,
          remainingAttempts: 3 - attemptNum
        });
      }
    }
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const timestamps = { ...(order.lifecycleTimestamps || {}) };
  timestamps.deliveredAt = timestamps.deliveredAt || nowIso;
  if (coolerReturned) {
    timestamps.coolerReturnedAt = timestamps.coolerReturnedAt || nowIso;
  }

  const depositPaid = Number(order.coolerDeposit || 0);

  let handoverTemp = null;
  if (req.body.temp !== undefined || req.body.temperature !== undefined) {
    const parsed = Number(req.body.temp !== undefined ? req.body.temp : req.body.temperature);
    if (!isNaN(parsed) && parsed >= -30 && parsed <= 60) {
      handoverTemp = Number(parsed.toFixed(1));
    }
  }

  const updatedLog = handoverTemp !== null ? [
    ...(order.tempLog || []),
    {
      time: timeStr,
      temp: handoverTemp,
      event: `Delivered & Temperature verified (${handoverTemp}°C).`,
      source: 'STAFF_CHECK',
      recordedBy: req.user?.name || req.user?.email || 'Fleet Executive'
    }
  ] : (order.tempLog || []);

  let updatedOrder = null;

  if (isMongo) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // ATOMIC CLAIM: Only one request can transition orderStatus to DELIVERED
        const claimed = await Order.findOneAndUpdate(
          {
            _id: order._id,
            orderStatus: { $ne: 'DELIVERED' }
          },
          {
            $set: {
              status: 'Delivered',
              orderStatus: 'DELIVERED',
              lifecycleStatus: coolerReturned ? 'COOLER_RETURNED' : 'DELIVERED',
              lifecycleTimestamps: timestamps,
              coolerReturned: Boolean(coolerReturned),
              coolerDepositRefunded: (depositPaid > 0 && !order.coolerDepositRefunded),
              podImage: podImage || order.podImage,
              handoverNotes: notes || order.handoverNotes,
              deliveredAt: nowIso,
              cashCollected: collectedCashNum,
              paymentStatus: isCod ? 'PAID' : order.paymentStatus,
              liveTemp: handoverTemp !== null ? handoverTemp : (order.liveTemp ?? null),
              tempLog: updatedLog,
              pinAttempts: 0,
              pinLockedUntil: null
            }
          },
          { new: true, session }
        );

        if (!claimed) {
          const err = new Error('Order has already been handed over and completed.');
          err.statusCode = 400;
          throw err;
        }

        // ONLY THE WINNER MAY RECORD CASH FOR COD ORDERS, USING $inc:
        if (isCod && collectedCashNum > 0 && req.user && req.user.id) {
          await User.updateOne(
            { id: req.user.id },
            { $inc: { cashInHand: collectedCashNum } },
            { session }
          );
        }

        // Release cooler if returned
        if (coolerReturned && claimed.coolerId) {
          await Cooler.findOneAndUpdate(
            { id: claimed.coolerId },
            { $set: { status: 'available', currentOrderId: null, currentUserId: null } },
            { session }
          );
        }

        // Refund deposit if paid and cooler returned
        if (depositPaid > 0 && coolerReturned && !claimed.coolerDepositRefunded && claimed.userId) {
          await creditWallet({
            userId: claimed.userId,
            amount: depositPaid,
            idempotencyKey: `refund_cooler_${claimed.id}`,
            orderId: claimed.orderNumber || claimed.id,
            title: 'Cold Box Deposit Refund',
            description: `Doorstep cooler returned for Order #${claimed.orderNumber || claimed.id}`
          }, { session });
        }

        updatedOrder = claimed.toObject();
      });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    } finally {
      await session.endSession();
    }
  } else {
    // LowDB fallback
    updatedOrder = await updateOrder(order.id, {
      status: 'Delivered',
      orderStatus: 'DELIVERED',
      lifecycleStatus: coolerReturned ? 'COOLER_RETURNED' : 'DELIVERED',
      lifecycleTimestamps: timestamps,
      coolerReturned: !!coolerReturned,
      coolerDepositRefunded: depositPaid > 0,
      podImage: podImage || order.podImage,
      handoverNotes: notes || order.handoverNotes,
      deliveredAt: nowIso,
      cashCollected: collectedCashNum,
      paymentStatus: collectedCashNum > 0 ? 'PAID' : order.paymentStatus,
      liveTemp: handoverTemp !== null ? handoverTemp : (order.liveTemp ?? null),
      tempLog: updatedLog,
      pinAttempts: 0,
      pinLockedUntil: null
    });

    if (isCod && collectedCashNum > 0 && req.user && req.user.role === 'rider') {
      const rider = await findUserById(req.user.id);
      if (rider) {
        await updateUser(rider.id, { cashInHand: (rider.cashInHand || 0) + collectedCashNum });
      }
    }

    if (coolerReturned && order.coolerId) {
      await updateCooler(order.coolerId, { status: 'available' });
    }
  }

  const sanitized = { ...updatedOrder };
  if (req.user && req.user.role !== 'admin' && sanitized.userId !== req.user.id) {
    delete sanitized.deliveryPin;
  }

  res.json({
    success: true,
    message: 'Delivery handover completed and verified',
    order: sanitized
  });
};

// Rider Cash Deposit Request: Rider creates a PENDING request.
// cashInHand changes ONLY after an operations admin confirms it.
app.post('/api/rider/cash-deposit', authenticate, requireRole('rider'), requireApproved, async (req, res) => {
  const { amount, depotId, notes } = req.body;
  const depositAmt = Math.round(Number(amount));
  if (isNaN(depositAmt) || depositAmt <= 0) {
    return res.status(400).json({ error: 'Please specify a valid positive cash deposit amount' });
  }

  const rider = await findUserById(req.user.id);
  const currentCash = Number(rider?.cashInHand || 0);
  if (depositAmt > currentCash) {
    return res.status(400).json({
      error: `Deposit amount (₹${depositAmt}) exceeds current cash in hand (₹${currentCash}).`
    });
  }

  const depositId = `DEP-${Date.now()}-${uuidv4().slice(0, 6)}`;
  const receiptNo = `DEP-RCP-${Math.floor(100000 + Math.random() * 900000)}`;

  const deposit = await CashDeposit.create({
    id: depositId,
    riderId: req.user.id,
    riderName: req.user.name,
    amount: depositAmt,
    status: 'PENDING',
    depotId: depotId || 'DEPOT-BLR-CENTRAL',
    receiptNo,
    notes: notes || 'Rider cash handover at depot counter'
  });

  res.json({
    success: true,
    message: 'Cash deposit request submitted. Awaiting operations admin verification and confirmation.',
    deposit,
    currentCashInHand: currentCash,
    receiptNo
  });
});

// Admin Cash Deposits Queue
app.get('/api/admin/cash-deposits', authenticate, requireAdmin, async (req, res) => {
  const { status } = req.query;
  const query = {};
  if (status) query.status = status;
  const deposits = await CashDeposit.find(query).sort({ createdAt: -1 }).lean();
  res.json(deposits);
});

// Admin Confirm Cash Deposit: Atomic update and audit record; prevents double confirmation
app.post('/api/admin/cash-deposits/:id/confirm', authenticate, requireAdmin, async (req, res) => {
  const isMongo = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  if (!isMongo) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  const session = await mongoose.startSession();
  try {
    let result = null;
    await session.withTransaction(async () => {
      // Atomic claim: only transition from PENDING to CONFIRMED
      const deposit = await CashDeposit.findOneAndUpdate(
        { id: req.params.id, status: 'PENDING' },
        {
          $set: {
            status: 'CONFIRMED',
            confirmedBy: req.user.id,
            confirmedAt: new Date().toISOString()
          }
        },
        { new: true, session }
      );

      if (!deposit) {
        const err = new Error('Deposit request not found, or has already been confirmed/rejected.');
        err.statusCode = 400;
        throw err;
      }

      // Atomically decrement rider's cashInHand
      await User.updateOne(
        { id: deposit.riderId },
        { $inc: { cashInHand: -deposit.amount } },
        { session }
      );

      result = deposit.toObject();
    });

    const refreshedRider = await User.findOne({ id: result.riderId }).lean();
    res.json({
      success: true,
      message: `Cash deposit of ₹${result.amount} confirmed for rider ${result.riderName}`,
      deposit: result,
      riderRemainingCash: refreshedRider?.cashInHand || 0
    });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  } finally {
    await session.endSession();
  }
});

// Admin Refund Queue for REFUND_REQUIRED and REFUND_PENDING orders
app.get('/api/admin/refunds/queue', authenticate, requireAdmin, async (req, res) => {
  try {
    const queue = await getRefundQueue(req.query);
    res.json(queue);
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
});

// Admin-Only Idempotent Order Refund Action
app.post('/api/admin/orders/:id/refund', authenticate, requireAdmin, async (req, res) => {
  try {
    const idempotencyKey = req.headers['idempotency-key'] || req.body?.idempotencyKey;
    const reason = req.body?.reason || 'Operations admin initiated refund';
    const result = await processOrderRefund({
      orderId: req.params.id,
      adminUser: req.user,
      reason,
      idempotencyKey
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// Admin Check Refund Status
app.post('/api/admin/orders/:id/refund/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await checkRefundStatus({ orderId: req.params.id });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});
app.get('/api/admin/orders/:id/refund/status', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await checkRefundStatus({ orderId: req.params.id });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

app.post('/api/orders/:id/handover', authenticate, handleOrderHandover);
app.put('/api/orders/:id/handover', authenticate, handleOrderHandover);

// Update prep / delivery status
const handleUpdateStatus = async (req, res) => {
  const { 
    status, 
    orderStatus, 
    coolerId, 
    notes, 
    note, 
    weighedWeight,
    batchLotId,
    sealTag,
    butcherName,
    riderLocation,
    deliveryExecutive
  } = req.body;

  const order = await findOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const isAdmin = req.user && req.user.role === 'admin';
  const isApprovedRider = req.user && req.user.role === 'rider' && req.user.approvalStatus === 'approved';
  const isAssignedRider = isApprovedRider && Boolean(order.riderId && order.riderId === req.user.id);
  const isApprovedPartner = req.user && req.user.role === 'partner' && req.user.approvalStatus === 'approved';
  const isAssignedPartner = isApprovedPartner && Boolean(order.partnerId && (order.partnerId === req.user.id || (req.user.shopId && order.partnerId === req.user.shopId)));

  if (!isAdmin && !isAssignedRider && !isAssignedPartner) {
    return res.status(403).json({ error: 'Access denied: Only authorized, approved station partners, assigned riders, or operations admins can update order status.' });
  }

  // Normalize target status before checks. No status spelling may bypass PIN delivery.
  const targetStatus = normalizeLifecycle(status || orderStatus || '');

  // Delivery CANNOT be marked via status update; it MUST go through PIN verification
  if (targetStatus === 'DELIVERED') {
    return res.status(400).json({ error: 'Orders can only be marked DELIVERED via the /api/orders/:id/handover route with customer delivery PIN verification.' });
  }

  // Cancellation MUST go through unified cancelOrder
  if (targetStatus === 'CANCELLED') {
    try {
      const cancelled = await cancelOrder({ orderId: order.id, user: req.user, reason: notes || note || 'Cancelled via status update' });
      const sanitized = { ...cancelled };
      if (req.user && req.user.role !== 'admin' && sanitized.userId !== req.user.id) {
        delete sanitized.deliveryPin;
      }
      return res.json(sanitized);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ error: err.message });
    }
  }

  const resolvedOrderStatus = targetStatus || order.orderStatus;
  const currentStatus = normalizeLifecycle(order.lifecycleStatus || order.orderStatus || order.status);

  // Validate state machine transition & role permissions
  if (resolvedOrderStatus && resolvedOrderStatus !== currentStatus) {
    if (!isValidTransition(currentStatus, resolvedOrderStatus)) {
      return res.status(400).json({
        error: `Invalid order state transition from '${currentStatus}' to '${resolvedOrderStatus}'.`
      });
    }

    if (!canRoleExecuteTransition(req.user.role, currentStatus, resolvedOrderStatus)) {
      return res.status(403).json({
        error: `Role '${req.user.role}' is not authorized to execute order transition from '${currentStatus}' to '${resolvedOrderStatus}'.`
      });
    }
  }

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (resolvedOrderStatus === 'OUT_FOR_DELIVERY' && order.coolerId) {
    await updateCooler(order.coolerId, { status: 'in_transit' });
  }

  const updatedOrder = await updateOrder(order.id, {
    status: status || resolvedOrderStatus,
    orderStatus: resolvedOrderStatus,
    prepStage: status,
    coolerId: coolerId || order.coolerId,
    weighedWeight: weighedWeight || order.weighedWeight,
    batchLotId: batchLotId || order.batchLotId,
    sealTag: sealTag || order.sealTag,
    butcherName: butcherName || order.butcherName,
    riderLocation: riderLocation || order.riderLocation,
    deliveryExecutive: deliveryExecutive || order.deliveryExecutive
  });

  const sanitized = { ...updatedOrder };
  if (req.user && req.user.role !== 'admin' && sanitized.userId !== req.user.id) {
    delete sanitized.deliveryPin;
  }

  res.json(sanitized);
};

app.patch('/api/orders/:id/status', authenticate, handleUpdateStatus);
app.put('/api/orders/:id/status', authenticate, handleUpdateStatus);

// Customer Order Cancellation (Unified Cancellation Service)
app.post('/api/orders/:id/cancel', authenticate, async (req, res) => {
  try {
    const cancelled = await cancelOrder({ 
      orderId: req.params.id, 
      user: req.user, 
      reason: req.body?.reason || 'Customer requested cancellation' 
    });

    const sanitized = { ...cancelled };
    if (req.user && req.user.role !== 'admin' && sanitized.userId !== req.user.id) {
      delete sanitized.deliveryPin;
    }

    res.json({ success: true, message: 'Order cancelled successfully', order: sanitized });
  } catch (err) {
    res.status(err.statusCode || 400).json({ error: err.message });
  }
});

// Customer Concierge Support & Contact Form Submission (Anti-Spam Rate Limited)
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, phone, category, orderId, message } = req.body;
  if (!name || !phone || !message) {
    return res.status(400).json({ error: 'Name, phone number, and message are required.' });
  }

  const ticketId = `TKT-${Math.floor(10000 + Math.random() * 90000)}`;
  const ticket = {
    id: ticketId,
    name,
    email: email || '',
    phone,
    category: category || 'general',
    orderId: orderId || null,
    message,
    status: 'OPEN',
    createdAt: new Date().toISOString()
  };

  try {
    await createContact(ticket);
  } catch (e) {
    console.warn('Could not insert to contacts table:', e.message);
  }

  res.json({
    success: true,
    ticketId,
    message: 'Your message has been delivered to BrisketBox Customer Support.'
  });
});

// Staff Temperature Check Route
// Records real temperature reading from authorized staff or calibrated sensor probe with audit trail
app.post('/api/orders/:id/temperature', authenticate, async (req, res) => {
  const order = await findOrderById(req.params.id);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const isAdmin = req.user.role === 'admin';
  const isApprovedPartner = req.user.role === 'partner' && req.user.approvalStatus === 'approved';
  const isAssignedRider = req.user.role === 'rider' && req.user.approvalStatus === 'approved' && (order.riderId === req.user.id || !order.riderId);

  if (!isAdmin && !isApprovedPartner && !isAssignedRider) {
    return res.status(403).json({ error: 'Access denied: Only authorized staff or assigned fleet riders can record temperature checks' });
  }

  const rawTemp = req.body.temp !== undefined ? req.body.temp : req.body.temperature;
  const tempNum = Number(rawTemp);
  if (rawTemp === undefined || rawTemp === null || isNaN(tempNum) || tempNum < -30 || tempNum > 60) {
    return res.status(400).json({ error: 'Invalid temperature reading. Temperature must be a valid number between -30°C and 60°C.' });
  }

  const rawSource = String(req.body.source || 'STAFF_CHECK').toUpperCase();
  const source = ['STAFF_CHECK', 'SENSOR'].includes(rawSource) ? rawSource : 'STAFF_CHECK';
  const recordedBy = req.user.name || req.user.email || req.user.id;

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const roundedTemp = Number(tempNum.toFixed(1));

  const logEntry = {
    time: timeStr,
    temp: roundedTemp,
    event: req.body.event || req.body.notes || `Staff temperature check recorded by ${recordedBy} (${source === 'SENSOR' ? 'IoT Sensor Probe' : 'Calibrated Staff Thermometer'})`,
    source,
    recordedBy
  };

  const updatedLog = [...(order.tempLog || []), logEntry];

  await updateOrder(order.id, {
    liveTemp: roundedTemp,
    tempLog: updatedLog
  });

  res.json({
    success: true,
    liveTemp: roundedTemp,
    tempLog: updatedLog,
    recordedEntry: logEntry
  });
});

app.post('/api/orders/:id/simulate-temp', (req, res) => {
  res.status(404).json({ error: 'simulate-temp endpoint has been removed. All temperatures must be recorded by authorized staff or real sensors.' });
});

// ==========================================
// 4. REUSABLE COOLER FLEET & RETURNS
// ==========================================

app.get('/api/coolers', authenticate, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json(await findCoolers());
  }
  const userCoolers = await findCoolers({ currentUserId: req.user.id });
  res.json(userCoolers);
});

app.get('/api/coolers/my-coolers', authenticate, async (req, res) => {
  const coolers = await findCoolers({ currentUserId: req.user.id });
  const returns = await findCoolerReturns({ userId: req.user.id });
  res.json({ coolers, returns });
});

app.post('/api/coolers/request-return', authenticate, async (req, res) => {
  const { coolerId, pickupSlot, notes, address, upiId, refundPreference = 'wallet' } = req.body;
  if (!coolerId) {
    return res.status(400).json({ error: 'Please select a cooler box to return' });
  }

  const cooler = await findCoolerById(coolerId);
  if (!cooler) {
    return res.status(404).json({ error: 'Cooler box not found' });
  }

  if (cooler.currentUserId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'This cooler box is not tagged to your account' });
  }

  const refundMethodLabel = refundPreference === 'wallet'
    ? 'BrisketBox Wallet (Instant Store Credit)'
    : (upiId ? `Direct UPI / Bank (${upiId})` : (req.user.upiId ? `Direct UPI (${req.user.upiId})` : 'Direct Bank Transfer'));

  const linkedOrder = cooler.currentOrderId ? await findOrderById(cooler.currentOrderId) : null;
  const actualDeposit = Number(linkedOrder?.coolerDeposit ?? cooler.depositAmount ?? 0);

  const returnRecord = {
    id: `RET-${Math.floor(100 + Math.random() * 900)}`,
    coolerId: cooler.id,
    orderId: cooler.currentOrderId || 'N/A',
    userId: req.user.id,
    userName: req.user.name,
    userPhone: req.user.phone ? normalizePhone(req.user.phone) : '',
    userAddress: address || req.user.address,
    status: 'pickup_requested',
    requestDate: new Date().toISOString(),
    scheduledPickupSlot: pickupSlot || 'Tomorrow Morning, 7:00 AM - 10:00 AM',
    refundAmount: actualDeposit,
    refundPreference: refundPreference || 'wallet',
    refundMode: refundMethodLabel,
    notes: notes || 'Rinsed with gel packs kept inside box for doorstep pickup.',
    courierAssigned: 'Hub Return Partner Chetan'
  };

  await createCoolerReturn(returnRecord);
  await updateCooler(cooler.id, {
    status: 'return_requested'
  });

  res.status(201).json(returnRecord);
});

app.get('/api/returns', authenticate, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.json(await findCoolerReturns());
  }
  const userReturns = await findCoolerReturns({ userId: req.user.id });
  res.json(userReturns);
});

app.patch('/api/returns/:id/status', authenticate, requireAdmin, async (req, res) => {
  const { status, conditionNotes, refundPreference } = req.body;
  const returnItem = await findCoolerReturnById(req.params.id);
  if (!returnItem) {
    return res.status(404).json({ error: 'Return request not found' });
  }

  const resolvedPreference = refundPreference || returnItem.refundPreference || 'wallet';

  const updatedReturn = await updateCoolerReturn(returnItem.id, {
    status,
    conditionNotes: conditionNotes || 'Box inspected: EPP walls intact, gel bricks sanitized.',
    completedAt: status === 'refunded' ? new Date().toISOString() : returnItem.completedAt
  });

  if (status === 'refunded') {
    const cooler = await findCoolerById(returnItem.coolerId);
    if (cooler) {
      await updateCooler(cooler.id, {
        status: 'available',
        currentOrderId: null,
        currentUserId: null,
        currentUserName: null,
        cyclesUsed: (cooler.cyclesUsed || 0) + 1,
        lastSanitizedDate: new Date().toISOString().split('T')[0]
      });
    }

    const user = await findUserById(returnItem.userId);
    if (user) {
      const refundAmt = Number(returnItem.refundAmount) || 0;
      if (refundAmt > 0 && resolvedPreference === 'wallet') {
        try {
          await creditWallet({
            userId: user.id,
            amount: refundAmt,
            idempotencyKey: `return_refund_${returnItem.id}`,
            title: 'Cooler Box Deposit Refund',
            description: `insulated bag box #${returnItem.coolerId} returned & verified. Instant refund added to BrisketBox Wallet.`
          });
        } catch (wErr) {
          console.warn('[Return Status] Wallet credit error:', wErr.message);
        }
      } else if (refundAmt > 0) {
        await updateUser(user.id, {
          depositBalance: Math.max(0, (user.depositBalance || 0) - refundAmt)
        });
      }
    }
  } else if (status === 'picked_up') {
    await updateCooler(returnItem.coolerId, { status: 'sanitizing' });
  }

  res.json(updatedReturn);
});

// 1. Fleet-wide Cooler Health Overview
app.get('/api/admin/coolers/health', authenticate, requireAdmin, async (req, res) => {
  try {
    const [coolers, orders, coolerReturns] = await Promise.all([
      findCoolers(),
      findOrders(),
      findCoolerReturns()
    ]);
    const overview = generateFleetHealthOverview({ coolers, orders, coolerReturns });
    res.json({
      success: true,
      ...overview
    });
  } catch (err) {
    console.error('[Cooler Health] Fleet overview error:', err);
    res.status(500).json({ error: 'Failed to generate fleet health overview' });
  }
});

// 2. Specific Cooler Health Diagnostic (By QR Code or Box ID)
const handleCoolerHealthDiagnostic = async (req, res) => {
  try {
    const qrOrId = (req.params.qr || req.params.coolerId || '').trim();
    const coolers = await findCoolers();
    let cooler = findCooler(coolers, qrOrId);

    if (!cooler) {
      return res.status(404).json({
        found: false,
        qr: qrOrId,
        error: `No cooler found for ID or QR code '${qrOrId}'.`
      });
    }

    const [orders, coolerReturns] = await Promise.all([
      findOrders(),
      findCoolerReturns()
    ]);
    const dbData = { coolers, orders, coolerReturns };
    const tempCheck = getTemperatureCheck(cooler, dbData);
    const fleetDetails = getFleetDetails(cooler, dbData);
    const health = calculateHealthScore(cooler, tempCheck, fleetDetails);

    res.json({
      success: true,
      found: true,
      cooler,
      tempCheck,
      fleetDetails,
      health
    });
  } catch (err) {
    console.error('[Cooler Health] Diagnostic error:', err);
    res.status(500).json({ error: 'Failed to run cooler health diagnostic' });
  }
};

app.get('/api/admin/coolers/:qr/health', authenticate, requireAdmin, handleCoolerHealthDiagnostic);
app.get('/api/coolers/:qr/health', authenticate, requireAdmin, handleCoolerHealthDiagnostic);

// 3. Cooler Maintenance / Operational Actions (Sanitize, Flag Breakdown, Decommission)
app.post('/api/admin/coolers/:id/action', authenticate, requireAdmin, validate(coolerActionSchema), async (req, res) => {
  try {
    const coolerId = req.params.id;
    const { action, notes } = req.body;
    const cooler = await findCoolerById(coolerId);

    if (!cooler) {
      return res.status(404).json({ error: `Cooler ${coolerId} not found` });
    }

    const updates = {};
    const timestamp = new Date().toISOString();

    if (action === 'sanitize') {
      updates.status = 'available';
      updates.lastSanitizedDate = timestamp.split('T')[0];
      updates.cyclesUsed = (cooler.cyclesUsed || 0) + 1;
      updates.lastSanitizedNotes = notes || 'UV-C sanitization & wash completed';
    } else if (action === 'flag_damage' || action === 'flag_maintenance') {
      updates.status = 'damaged';
      updates.maintenanceReason = notes || 'Thermal gasket wear or lid seal compromise detected';
      updates.flaggedAt = timestamp;
    } else if (action === 'decommission') {
      updates.status = 'decommissioned';
      updates.decommissionReason = notes || 'Retired after maximum lifecycle wear';
      updates.retiredAt = timestamp;
    } else if (action === 'recommission') {
      updates.status = 'available';
      updates.maintenanceReason = null;
      updates.recommissionedAt = timestamp;
    } else {
      return res.status(400).json({ error: 'Invalid action. Supported: sanitize, flag_damage, decommission, recommission' });
    }

    const updated = await updateCooler(coolerId, updates);
    res.json({
      success: true,
      message: `Action '${action}' applied successfully to ${coolerId}`,
      cooler: updated
    });
  } catch (err) {
    console.error('[Cooler Health] Action error:', err);
    res.status(500).json({ error: 'Failed to apply cooler action' });
  }
});

// ==========================================
// 4B. COLD BOX QR SCANNER, TELEMETRY & DIAGNOSTICS (Ashik Spec)
// ==========================================
app.get('/api/coolers/inspect/:coolerId', authenticate, requireAdmin, async (req, res) => {
  const rawId = (req.params.coolerId || '').trim();
  const cleanId = rawId.replace(/^https?:\/\/[^\/]+\/(coolers\/)?/i, '').replace(/^BRISKETBOX-/i, '').replace(/^TV-/i, '');
  
  const coolers = await findCoolers();
  let cooler = coolers.find(c => 
    c.id.toLowerCase() === cleanId.toLowerCase() || 
    c.id.toLowerCase() === rawId.toLowerCase() ||
    (c.qrCode && c.qrCode.toLowerCase() === rawId.toLowerCase()) ||
    c.id.toLowerCase().includes(cleanId.toLowerCase())
  );

  if (!cooler) {
    return res.status(404).json({ error: `Cooler Box "${rawId}" not found in fleet directory.` });
  }

  const [orders, returns] = await Promise.all([
    findOrders(),
    findCoolerReturns()
  ]);

  const order = (cooler.currentOrderId ? orders.find(o => o.id === cooler.currentOrderId) : null) ||
    orders.find(o => o.coolerId === cooler.id) || null;

  const returnRecord = returns.find(r => r.coolerId === cooler.id && r.status !== 'refunded') ||
    returns.find(r => r.coolerId === cooler.id) || null;

  const isDamagedBox = cooler.status === 'damaged' || cooler.status === 'maintenance';
  const liveTemp = order?.liveTemp !== undefined ? order.liveTemp : null;
  const isCompliant = liveTemp !== null ? (liveTemp >= 0.0 && liveTemp <= 4.0) : null;
  const tempLog = order?.tempLog || [];

  const dispatchDate = order ? new Date(order.createdAt || Date.now() - 26 * 3600 * 1000) : new Date(Date.now() - 24 * 3600 * 1000);
  const now = new Date();
  const tatHours = Math.max(1, Math.round((now - dispatchDate) / (1000 * 60 * 60)));
  const tatStatus = tatHours <= 48 ? 'OPTIMAL_UNDER_48H' : (tatHours <= 72 ? 'STANDARD_WINDOW' : 'OVERDUE');

  const isEligible = cooler.status === 'with_customer' || cooler.status === 'return_requested' || cooler.status === 'in_transit';
  const linkedOrder = cooler.currentOrderId ? await findOrderById(cooler.currentOrderId) : null;
  const refundAmount = Number(linkedOrder?.coolerDeposit ?? cooler.depositAmount ?? 0);

  const dbData = { coolers, orders, coolerReturns: returns };
  const tempCheck = getTemperatureCheck({ ...cooler, status: isDamagedBox ? 'damaged' : cooler.status }, dbData);
  const fleetDetails = getFleetDetails({ ...cooler, status: isDamagedBox ? 'damaged' : cooler.status }, dbData);
  const health = calculateHealthScore({ ...cooler, status: isDamagedBox ? 'damaged' : cooler.status }, tempCheck, fleetDetails);

  res.json({
    success: true,
    cooler: {
      ...cooler,
      qrUrl: `https://brisketbox.in/coolers/${cooler.id}`
    },
    order: order ? {
      id: order.id,
      orderNumber: order.orderNumber || order.id,
      customerName: order.customerName,
      customerPhone: order.customerPhone || '',
      customerEmail: order.customerEmail,
      deliveryAddress: order.deliveryAddress,
      totalAmount: order.totalAmount || order.total,
      deliveryDate: order.createdAt,
      itemsSummary: (order.items || []).map(i => `${i.quantity || 1}x ${i.name || i.product?.name || 'Fresh Cut'}`).join(', ')
    } : null,
    returnRecord: returnRecord ? {
      id: returnRecord.id,
      status: returnRecord.status,
      requestDate: returnRecord.requestDate,
      scheduledPickupSlot: returnRecord.scheduledPickupSlot,
      refundPreference: returnRecord.refundPreference || 'wallet',
      refundMode: returnRecord.refundMode,
      upiId: returnRecord.upiId || null,
      courierAssigned: returnRecord.courierAssigned
    } : null,
    telemetry: {
      liveTemp,
      targetRange: 'Chilled',
      isCompliant,
      complianceRate: tempLog.length > 0 
        ? Math.round((tempLog.filter(t => t.temp >= 0 && t.temp <= 4).length / tempLog.length) * 100)
        : null,
      thermalHealthScore: null,
      insulationCondition: isDamagedBox ? 'NEEDS_GASKET_INSPECTION' : 'NORMAL',
      tempLog,
      tatHours: order ? tatHours : null,
      tatStatus: order ? tatStatus : null,
      cyclesUsed: cooler.cyclesUsed || 0,
      maxHoldingHours: cooler.maxHoldingHours || 36,
      singleUsePlasticBoxesSaved: null
    },
    refundAssessment: {
      isEligible,
      depositAmount: refundAmount,
      reason: isEligible 
        ? 'insulated bag deposit verified and approved for instant reversal.' 
        : (cooler.status === 'available' ? 'Box already returned & deposit refunded.' : 'Box under sanitization.'),
      recommendedAction: isDamagedBox 
        ? 'APPROVE_REFUND_AND_REPAIR_BOX' 
        : (isEligible ? 'APPROVE_INSTANT_REFUND' : 'BOX_READY_FOR_USE')
    },
    tempCheck,
    fleetDetails,
    health
  });
});

app.post('/api/coolers/inspect/:coolerId/approve-refund', authenticate, requireAdmin, validate(coolerInspectionDecisionSchema), async (req, res) => {
  const rawId = (req.params.coolerId || '').trim();
  const cleanId = rawId.replace(/^https?:\/\/[^\/]+\/(coolers\/)?/i, '').replace(/^BRISKETBOX-/i, '').replace(/^TV-/i, '');
  
  const coolers = await findCoolers();
  let cooler = coolers.find(c => 
    c.id.toLowerCase() === cleanId.toLowerCase() || 
    c.id.toLowerCase() === rawId.toLowerCase() ||
    (c.qrCode && c.qrCode.toLowerCase() === rawId.toLowerCase())
  );

  if (!cooler) {
    return res.status(404).json({ error: 'Cooler box not found' });
  }

  const { refundPreference = 'wallet', upiId, inspectorNotes = 'QR Inward Inspection: EPP foam walls intact, gel bricks sanitized.' } = req.body;

  const userId = cooler.currentUserId;
  const user = userId ? await findUserById(userId) : null;
  const linkedOrder = cooler.currentOrderId ? await findOrderById(cooler.currentOrderId) : null;
  const refundAmt = Number(linkedOrder?.coolerDeposit ?? cooler.depositAmount ?? 0);

  const returns = await findCoolerReturns();
  let returnRecord = returns.find(r => r.coolerId === cooler.id && r.status !== 'refunded');

  if (returnRecord) {
    await updateCoolerReturn(returnRecord.id, {
      status: 'refunded',
      conditionNotes: inspectorNotes,
      completedAt: new Date().toISOString(),
      refundMode: refundPreference === 'wallet' ? 'BrisketBox Wallet (Instant Store Credit)' : `Direct UPI (${upiId || user?.upiId || ''})`
    });
  } else {
    returnRecord = {
      id: `RET-${Math.floor(100 + Math.random() * 900)}`,
      coolerId: cooler.id,
      orderId: cooler.currentOrderId || 'ORD-AUTO',
      userId: userId || 'customer',
      userName: cooler.currentUserName || user?.name || 'Valued Customer',
      userPhone: user?.phone ? normalizePhone(user.phone) : '',
      userAddress: user?.address || 'Customer Registered Address',
      status: 'refunded',
      requestDate: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      refundAmount: refundAmt,
      refundPreference,
      refundMode: refundPreference === 'wallet' ? 'BrisketBox Wallet (Instant Store Credit)' : `Direct UPI (${upiId || user?.upiId || ''})`,
      conditionNotes: inspectorNotes,
      courierAssigned: 'Hub Inward Specialist'
    };
    await createCoolerReturn(returnRecord);
  }

  if (user) {
    if (refundPreference === 'wallet') {
      try {
        await creditWallet({
          userId: user.id,
          amount: refundAmt,
          idempotencyKey: `cooler_inspect_refund_${cooler.id}_${Date.now()}`,
          title: 'Cooler Box Deposit Refund',
          description: `insulated bag box #${cooler.id} QR inspected & verified. Instant refund added to BrisketBox Wallet.`
        });
      } catch (wErr) {
        console.warn('[Cooler Refund] Wallet credit error:', wErr.message);
      }
    } else {
      await updateUser(user.id, {
        depositBalance: Math.max(0, (user.depositBalance || 0) - refundAmt)
      });
    }
  }

  const updatedCooler = await updateCooler(cooler.id, {
    status: 'available',
    currentOrderId: null,
    currentUserId: null,
    currentUserName: null,
    cyclesUsed: (cooler.cyclesUsed || 0) + 1,
    lastSanitizedDate: new Date().toISOString().split('T')[0]
  });

  res.json({
    success: true,
    message: `🎉 ₹${refundAmt} deposit refund approved and disbursed to ${refundPreference === 'wallet' ? 'BrisketBox Wallet' : 'UPI'}!`,
    refundAmount: refundAmt,
    refundMode: refundPreference === 'wallet' ? 'Wallet Credit' : 'Instant UPI Reversal',
    cooler: updatedCooler,
    returnRecord
  });
});

app.post('/api/coolers/inspect/:coolerId/flag-damage', authenticate, requireAdmin, async (req, res) => {
  const rawId = (req.params.coolerId || '').trim();
  const cleanId = rawId.replace(/^https?:\/\/[^\/]+\/(coolers\/)?/i, '').replace(/^BRISKETBOX-/i, '').replace(/^TV-/i, '');
  
  const coolers = await findCoolers();
  let cooler = coolers.find(c => 
    c.id.toLowerCase() === cleanId.toLowerCase() || 
    c.id.toLowerCase() === rawId.toLowerCase() ||
    (c.qrCode && c.qrCode.toLowerCase() === rawId.toLowerCase())
  );

  if (!cooler) {
    return res.status(404).json({ error: 'Cooler box not found' });
  }

  const { reason = 'Temperature breach detected' } = req.body;
  const updated = await updateCooler(cooler.id, {
    status: 'maintenance',
    maintenanceReason: reason,
    lastInspectedDate: new Date().toISOString()
  });

  res.json({
    success: true,
    message: `Box #${cooler.id} quarantined for maintenance: "${reason}".`,
    cooler: updated
  });
});

app.get('/api/admin/cooler-analytics', authenticate, requireAdmin, async (req, res) => {
  const [coolers, returns, orders] = await Promise.all([
    findCoolers(),
    findCoolerReturns(),
    findOrders()
  ]);

  const totalCoolers = coolers.length;
  const withCustomer = coolers.filter(c => c.status === 'with_customer').length;
  const returnRequested = coolers.filter(c => c.status === 'return_requested').length;
  const available = coolers.filter(c => c.status === 'available').length;
  const inMaintenance = coolers.filter(c => c.status === 'maintenance' || c.status === 'sanitizing').length;

  const totalRefunded = returns.filter(r => r.status === 'refunded').reduce((sum, r) => sum + (Number(r.refundAmount) || 0), 0);
  const totalHeld = coolers.filter(c => ['with_customer', 'return_requested'].includes(c.status)).reduce((sum, c) => sum + (Number(c.depositAmount) || 0), 0);
  const totalDepositsCollected = totalRefunded + totalHeld;

  const completedReturns = returns.filter(r => r.status === 'refunded' && r.completedAt && r.requestDate);
  let avgTatHours = null;
  if (completedReturns.length > 0) {
    const totalReturnMs = completedReturns.reduce((acc, r) => acc + (new Date(r.completedAt) - new Date(r.requestDate)), 0);
    avgTatHours = Number((totalReturnMs / (completedReturns.length * 1000 * 3600)).toFixed(1));
  }
  const recoveryRate = returns.length > 0
    ? Math.round((returns.filter(r => r.status === 'refunded').length / returns.length) * 100)
    : null;

  const ordersWithLogs = orders.filter(o => o.tempLog && o.tempLog.length > 0);
  const compliantOrders = ordersWithLogs.filter(o => o.tempLog.every(t => t.temp >= 0 && t.temp <= 4));
  const coldChainCompliance = ordersWithLogs.length > 0
    ? Number(((compliantOrders.length / ordersWithLogs.length) * 100).toFixed(1))
    : null;

  res.json({
    success: true,
    metrics: {
      totalFleetSize: totalCoolers,
      availableCount: available,
      withCustomerCount: withCustomer,
      returnRequestedCount: returnRequested,
      maintenanceCount: inMaintenance,
      avgTatHours,
      avgTatDays: avgTatHours ? `${(avgTatHours / 24).toFixed(1)} Days` : null,
      boxRecoveryRate: recoveryRate !== null ? `${recoveryRate}%` : null,
      coldChainComplianceRate: coldChainCompliance !== null ? `${coldChainCompliance}%` : null,
      depositLedger: {
        totalCollected: totalDepositsCollected,
        totalRefunded: totalRefunded,
        activeHeld: totalHeld
      }
    }
  });
});

// ==========================================
// 5. IN-APP VAULT WALLET
// ==========================================
app.get('/api/wallet', authenticate, async (req, res) => {
  const user = await findUserById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    balance: user.walletBalance || 0,
    depositBalance: user.depositBalance || 0,
    transactions: user.walletTransactions || [],
    upiId: user.upiId || ''
  });
});

// ==========================================
// 5. OPERATIONS METRICS
// ==========================================

app.get('/api/admin/metrics', authenticate, requireAdmin, async (req, res) => {
  const [orders, coolers, returns, products] = await Promise.all([
    findOrders(),
    findCoolers(),
    findCoolerReturns(),
    findProducts()
  ]);

  const totalRevenue = orders.reduce((sum, o) => sum + (o.subtotal || 0), 0);
  const activeOrders = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled').length;
  const coolersInCustody = coolers.filter(c => c.status === 'with_customer' || c.status === 'in_transit').length;
  const totalCoolers = coolers.length;
  const completedReturns = returns.filter(r => r.status === 'refunded').length;

  res.json({
    totalRevenue,
    totalOrders: orders.length,
    activeOrders,
    coolersInCustody,
    totalCoolersFleet: totalCoolers,
    availableCoolers: coolers.filter(c => c.status === 'available').length,
    pendingReturns: returns.filter(r => r.status !== 'refunded').length,
    completedReturns,
    coolerReturnRate: 96,
    coldChainCompliance: 99.6,
    productsCount: products.length
  });
});

// Admin Database Backup Snapshot
app.post('/api/admin/backup', authenticate, requireAdmin, (req, res) => {
  try {
    const backupResult = createBackup();
    res.json({
      success: true,
      message: `Database backup created successfully: ${backupResult.fileName}`,
      ...backupResult
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create backup snapshot', details: err.message });
  }
});

// Admin Customer Management
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  const [allUsers, allOrders] = await Promise.all([
    findUsers(),
    findOrders()
  ]);

  const users = allUsers.map(u => {
    const { password, ...userWithoutPw } = u;
    const userOrders = allOrders.filter(o => o.userId === u.id || o.customerEmail === u.email);
    const totalSpent = userOrders.reduce((sum, o) => sum + (o.paymentStatus === 'PAID' ? (o.total || o.subtotal || 0) : 0), 0);
    return {
      ...userWithoutPw,
      totalOrders: userOrders.length,
      totalSpent
    };
  });
  res.json(users);
});

// Admin Fleet: Register New Cooler
app.post('/api/coolers', authenticate, requireAdmin, async (req, res) => {
  const { id, qrCode, model, depositAmount, assignedHub } = req.body;
  if (!id) return res.status(400).json({ error: 'Cooler ID is required (e.g. BOX-BLR-109)' });
  
  const existing = await findCoolerById(id);
  if (existing) return res.status(409).json({ error: 'Cooler ID already exists' });
  
  const newCooler = {
    id,
    qrCode: qrCode || `BRISKETBOX-${id}`,
    model: model || 'insulated bag 18L - Reusable EPP Cold-Gel Box',
    status: 'available',
    currentOrderId: null,
    currentUserId: null,
    currentUserName: null,
    cyclesUsed: 0,
    lastSanitizedDate: new Date().toISOString().split('T')[0],
    depositAmount: Number(depositAmount) || 0,
    maxHoldingHours: 36,
    assignedHub: assignedHub || 'Bengaluru Central Hub Depot'
  };
  
  const created = await createCooler(newCooler);
  res.status(201).json(created);
});

// Admin Fleet: Update Cooler Status / Sanitation cycle
app.patch('/api/coolers/:id/status', authenticate, requireAdmin, async (req, res) => {
  const { status, assignedHub } = req.body;
  const cooler = await findCoolerById(req.params.id);
  if (!cooler) return res.status(404).json({ error: 'Cooler not found' });
  
  const updates = { status };
  if (status === 'available') {
    updates.lastSanitizedDate = new Date().toISOString().split('T')[0];
    updates.cyclesUsed = (cooler.cyclesUsed || 0) + 1;
  }
  if (assignedHub) updates.assignedHub = assignedHub;
  
  const updated = await updateCooler(req.params.id, updates);
  res.json(updated);
});

// Admin Courier & Fleet Assignment for Order
app.patch('/api/orders/:id/courier', authenticate, requireAdmin, async (req, res) => {
  const { deliveryExecutive, coolerId } = req.body;
  const order = await findOrderById(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  
  const updates = {};
  if (deliveryExecutive) updates.deliveryExecutive = deliveryExecutive;
  if (coolerId) {
    updates.coolerId = coolerId;
    await updateCooler(coolerId, {
      status: 'assigned',
      currentOrderId: order.id,
      currentUserId: order.userId,
      currentUserName: order.customerName
    });
  }
  
  const updated = await updateOrder(req.params.id, updates);
  res.json(updated);
});

// Central Production Error Handler (Zero stack trace or internal path leaks)
app.use((err, req, res, next) => {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.VERCEL;
  const statusCode = err.status || err.statusCode || (err.name === 'ZodError' ? 400 : 500);

  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'Access denied by BrisketBox CORS policy' });
  }

  if (err.name === 'ZodError') {
    return res.status(400).json({
      error: 'Request validation failed',
      details: err.errors ? err.errors.map(e => ({ field: (e.path || []).join('.'), message: e.message })) : []
    });
  }

  // Sanitize MongoDB / Mongoose errors
  if (err.name === 'CastError' || err.name === 'ValidationError') {
    return res.status(400).json({ error: 'Invalid data format or database constraint violation' });
  }

  console.error(`[API Error] ${req.method} ${req.url}:`, err.message || err);

  res.status(statusCode).json({
    error: isProd ? 'An unexpected server error occurred. Our team has been notified.' : (err.message || 'Server error'),
    ...(isProd ? {} : { debugMessage: err.message })
  });
});

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (!process.env.VERCEL && isDirectRun) {
  app.get('*', (req, res) => {
    const indexHtml = path.join(clientDist, 'index.html');
    res.sendFile(indexHtml);
  });

  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`[BrisketBox API] Running on http://${HOST}:${PORT}`);
  });
}

export default app;
