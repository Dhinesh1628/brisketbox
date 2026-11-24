import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { User, Product, Order, Cooler, CoolerReturn } from './mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isProd = process.env.NODE_ENV === 'production';
const DATA_FILE = isProd ? null : path.join(__dirname, 'data.json');

const getModel = (collection) => {
  switch (collection) {
    case 'users': return User;
    case 'products': return Product;
    case 'orders': return Order;
    case 'coolers': return Cooler;
    case 'coolerReturns': return CoolerReturn;
    default: return null;
  }
};

const isDemoSeedEnabled = process.env.NODE_ENV !== 'production' && process.env.ENABLE_DEMO_SEED === 'true';

const getInitialUsers = () => {
  if (!isDemoSeedEnabled) return [];
  const devPassword = process.env.DEV_DEMO_PASSWORD || crypto.randomBytes(12).toString('hex');
  const demoHash = bcrypt.hashSync(devPassword, 10);
  if (!process.env.DEV_DEMO_PASSWORD) {
    console.info('[DEV DEMO SEED] Generated random demo password for local session (never committed).');
  }
  return [
    {
      id: "usr_admin",
      name: "Operations Admin",
      email: "ops@brisketbox.in",
      password: demoHash,
      role: "admin",
      phone: "+91 90000 00000",
      city: "Bengaluru",
      address: "BrisketBox Operations Center, Mahadevapura, Bengaluru 560048",
      depositBalance: 0,
      upiId: "ops@icici",
      createdAt: "2026-01-15T08:00:00.000Z"
    },
    {
      id: "usr_customer",
      name: "Demo Customer",
      email: "customer@brisketbox.in",
      password: demoHash,
      role: "customer",
      phone: "",
      city: "Bengaluru",
      address: "Indiranagar, Bengaluru 560038",
      depositBalance: 0,
      upiId: "customer@upi",
      createdAt: "2026-02-10T11:20:00.000Z"
    },
    {
      id: "usr_rider_1",
      name: "Demo Rider",
      email: "rider@brisketbox.in",
      password: demoHash,
      role: "rider",
      approvalStatus: "approved",
      phone: "",
      city: "Bengaluru",
      address: "Indiranagar, Bengaluru 560008",
      vehicleType: "EV 2-Wheeler",
      vehicleNumber: "KA-04-EV-000",
      licenseNumber: "KA0420220000000",
      upiId: "rider@upi",
      idDocType: "Driving License",
      assignedHub: "Bengaluru Central Hub Depot",
      isOnline: true,
      rating: 5.0,
      earningsToday: 0,
      totalDeliveries: 0,
      createdAt: "2026-03-01T08:00:00.000Z"
    },
    {
      id: "usr_partner_1",
      name: "Demo Partner",
      email: "partner@brisketbox.in",
      password: demoHash,
      role: "partner",
      approvalStatus: "approved",
      phone: "+91 98860 00000",
      city: "Bengaluru",
      address: "100 Feet Road, Indiranagar, Bengaluru 560038",
      shopId: "shop_central_butcher",
      shopName: "BrisketBox Central Station",
      shopAddress: "100 Feet Road, Indiranagar, Bengaluru 560038",
      fssaiNumber: "",
      operatingHours: "06:00 AM - 10:00 PM",
      categories: ["Fish & Seafood", "Mutton & Lamb", "Farm Fresh Chicken"],
      rating: 5.0,
      totalOrdersHandled: 0,
      createdAt: "2026-02-01T08:00:00.000Z"
    }
  ];
};

const INITIAL_DATA = {
  users: getInitialUsers(),
    products: [
    {
      id: "prod_1",
      name: "Surmai Tawa Fry",
      category: "Fish & Seafood",
      description: "Center-cut seer fish steaks, descaled and cleaned. Packed fresh on ice and ready to cook.",
      price: 799,
      mrp: 899,
      unit: "500g",
      netWeight: "450g",
      grossWeight: "650g",
      pieces: "4-6 Steaks",
      serves: "Serves 3-4",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Today 4:00 AM catch",
      origin: "Mangalore Port, Karnataka",
      cutStyle: "Tawa fry steaks",
      stock: 40,
      image: "/images/products/prod_1.jpg",
      imageUrl: "/images/products/prod_1.jpg",
      vacuumSealed: true,
      featured: true
    },
    {
      id: "prod_2",
      name: "White Pomfret Whole",
      category: "Fish & Seafood",
      description: "Cleaned and gutted silver pomfret with light slits for frying. Good for tawa fry or curry.",
      price: 689,
      mrp: 749,
      unit: "400g",
      netWeight: "380g",
      grossWeight: "500g",
      pieces: "2 Whole Fish",
      serves: "Serves 2-3",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Daily inward",
      origin: "Ratnagiri, Maharashtra",
      cutStyle: "Whole cleaned with slits",
      stock: 35,
      image: "/images/products/prod_2.jpg",
      imageUrl: "/images/products/prod_2.jpg",
      vacuumSealed: true,
      featured: true
    },
    {
      id: "prod_3",
      name: "Jumbo Prawns",
      category: "Fish & Seafood",
      description: "Peeled and deveined sea prawns with tails on. Ready to cook in garlic butter or roast.",
      price: 599,
      mrp: 679,
      unit: "350g",
      netWeight: "300g",
      grossWeight: "500g",
      pieces: "14-18 Pieces",
      serves: "Serves 2-3",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Today catch",
      origin: "Karwar Coast, Karnataka",
      cutStyle: "Tail-on deveined",
      stock: 50,
      image: "/images/products/prod_3.jpg",
      imageUrl: "/images/products/prod_3.jpg",
      vacuumSealed: true,
      featured: true
    },
    {
      id: "prod_4",
      name: "Mutton Rogan Josh",
      category: "Tender Mutton",
      description: "Tender young goat cuts with bone. Cleaned and cut for curries and dum biryani.",
      price: 549,
      mrp: 599,
      unit: "500g",
      netWeight: "450g",
      grossWeight: "600g",
      pieces: "12-16 Pieces",
      serves: "Serves 3-4",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Fresh today",
      origin: "Dindigul Farms, Tamil Nadu",
      cutStyle: "Bone-in curry cut",
      stock: 60,
      image: "/images/products/prod_4.jpg",
      imageUrl: "/images/products/prod_4.jpg",
      vacuumSealed: true,
      featured: true
    },
    {
      id: "prod_5",
      name: "Chicken Breast Fillet",
      category: "Fresh Chicken",
      description: "Boneless skinless chicken breast fillets. Trimmed clean for grilling, pan-searing, or stir-fry.",
      price: 289,
      mrp: 320,
      unit: "450g",
      netWeight: "450g",
      grossWeight: "480g",
      pieces: "3-4 Fillets",
      serves: "Serves 3",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Fresh today",
      origin: "Local Poultry Farms, Karnataka",
      cutStyle: "Boneless fillets",
      stock: 75,
      image: "/images/products/prod_5.jpg",
      imageUrl: "/images/products/prod_5.jpg",
      vacuumSealed: true,
      featured: true
    },
    {
      id: "prod_6",
      name: "Country Chicken Curry Cut",
      category: "Fresh Chicken",
      description: "Country chicken cut into curry pieces with firm meat and rich flavor.",
      price: 389,
      mrp: 429,
      unit: "600g",
      netWeight: "550g",
      grossWeight: "700g",
      pieces: "14-18 Pieces",
      serves: "Serves 3-4",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Fresh today",
      origin: "Local Organic Farms, Karnataka",
      cutStyle: "Medium curry cut",
      stock: 45,
      image: "/images/products/prod_6.jpg",
      imageUrl: "/images/products/prod_6.jpg",
      vacuumSealed: true,
      featured: false
    },
    {
      id: "prod_7",
      name: "Fish Tikka Cut",
      category: "Ready to Cook",
      description: "Boneless fish cubes spiced with ajwain and herbs. Ready to pan-fry or grill.",
      price: 369,
      mrp: 399,
      unit: "350g",
      netWeight: "350g",
      grossWeight: "380g",
      pieces: "8-10 Pieces",
      serves: "Serves 2-3",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Fresh batch",
      origin: "Local Coastal Catch",
      cutStyle: "Boneless cubes",
      stock: 30,
      image: "/images/products/prod_7.jpg",
      imageUrl: "/images/products/prod_7.jpg",
      vacuumSealed: true,
      featured: false
    },
    {
      id: "prod_8",
      name: "Chicken Drumsticks",
      category: "Fresh Chicken",
      description: "Juicy chicken leg drumsticks with skin off. Good for frying, roasting, or rich gravies.",
      price: 299,
      mrp: 349,
      unit: "500g",
      netWeight: "450g",
      grossWeight: "500g",
      pieces: "5-6 Pieces",
      serves: "Serves 3-4",
      eta: "About 90 minutes",
      chillingMethod: "Chilled at 0°C to 4°C",
      catchDate: "Fresh today",
      origin: "Local Poultry Farms, Karnataka",
      cutStyle: "Skinless drumsticks",
      stock: 40,
      image: "/images/products/prod_8.jpg",
      imageUrl: "/images/products/prod_8.jpg",
      vacuumSealed: true,
      featured: true
    }
  ],
  coolers: [
    {
      id: "BOX-BLR-417",
      qrCode: "BRISKETBOX-BOX-417",
      model: "Insulated Cold Bag",
      status: "with_customer",
      currentOrderId: "ORD-417-DELIVERED",
      currentUserId: "usr_customer",
      currentUserName: "Pooja Sundaram",
      cyclesUsed: 14,
      lastSanitizedDate: "2026-11-05",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Mahadevapura Dark Hub"
    },
    {
      id: "BOX-BLR-182",
      qrCode: "BRISKETBOX-BOX-182",
      model: "insulated bag 24L - Dual Phase ColdGel Box",
      status: "assigned",
      currentOrderId: "ORD-9281",
      currentUserId: "usr_customer",
      currentUserName: "Pooja Sundaram",
      cyclesUsed: 8,
      lastSanitizedDate: "2026-11-06",
      depositAmount: 250,
      maxHoldingHours: 48,
      assignedHub: "Mahadevapura Dark Hub"
    },
    {
      id: "BOX-BLR-633",
      qrCode: "BRISKETBOX-BOX-633",
      model: "Insulated Cold Bag",
      status: "available",
      currentOrderId: null,
      currentUserId: null,
      currentUserName: null,
      cyclesUsed: 22,
      lastSanitizedDate: "2026-11-08",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Bengaluru Central Hub Depot"
    },
    {
      id: "BOX-BLR-983",
      qrCode: "BRISKETBOX-BOX-983",
      model: "Insulated Cold Bag",
      status: "with_customer",
      currentOrderId: "ORD-9281",
      currentUserId: "usr_customer",
      currentUserName: "Pooja Sundaram",
      cyclesUsed: 12,
      lastSanitizedDate: "2026-11-04",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Bengaluru Central Hub Depot"
    },
    {
      id: "BOX-BLR-103",
      qrCode: "BRISKETBOX-BOX-BLR-103",
      coolerCode: "BRISKETBOX-BOX-BLR-103",
      model: "insulated bag 24L - Dual Phase ColdGel Box",
      status: "damaged",
      currentOrderId: "ORD-103-BREACH",
      currentUserId: "usr_customer",
      currentUserName: "Pooja Sundaram",
      cyclesUsed: 19,
      lastSanitizedDate: "2026-10-24",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Bengaluru Central (Indiranagar Hub)",
      maintenanceReason: "Worn silicone gasket seal • Thermal breach excursion (5.8°C > 4.0°C safe limit)"
    },
    {
      id: "BOX-BLR-101",
      qrCode: "BRISKETBOX-BOX-101",
      qrCode: "BRISKETBOX-BOX-101",
      model: "Insulated Cold Bag",
      status: "with_customer",
      currentOrderId: "ord_101",
      currentUserId: "usr_customer",
      currentUserName: "Pooja Sundaram",
      cyclesUsed: 11,
      lastSanitizedDate: "2026-10-28",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Bengaluru East (Mahadevapura Hub)"
    },
    {
      id: "BOX-BLR-102",
      qrCode: "BRISKETBOX-BOX-102",
      model: "Insulated Cold Bag",
      status: "return_requested",
      currentOrderId: "ord_098",
      currentUserId: "usr_customer",
      currentUserName: "Pooja Sundaram",
      cyclesUsed: 19,
      lastSanitizedDate: "2026-10-22",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Bengaluru East (Mahadevapura Hub)"
    },
    {
      id: "BOX-BLR-103",
      qrCode: "BRISKETBOX-BOX-103",
      model: "insulated bag 24L - Dual Phase ColdGel Box",
      status: "in_transit",
      currentOrderId: "ord_102",
      currentUserId: "usr_customer",
      currentUserName: "Pooja Sundaram",
      cyclesUsed: 7,
      lastSanitizedDate: "2026-10-29",
      depositAmount: 250,
      maxHoldingHours: 48,
      assignedHub: "Bengaluru Central (Indiranagar Hub)"
    },
    {
      id: "BOX-BLR-104",
      qrCode: "BRISKETBOX-BOX-104",
      model: "Insulated Cold Bag",
      status: "available",
      currentOrderId: null,
      currentUserId: null,
      currentUserName: null,
      cyclesUsed: 14,
      lastSanitizedDate: "2026-10-30",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Bengaluru Central Hub Depot"
    },
    {
      id: "BOX-BLR-105",
      qrCode: "BRISKETBOX-BOX-105",
      model: "insulated bag 14L - Compact ColdGel Box",
      status: "available",
      currentOrderId: null,
      currentUserId: null,
      currentUserName: null,
      cyclesUsed: 4,
      lastSanitizedDate: "2026-10-30",
      depositAmount: 250,
      maxHoldingHours: 24,
      assignedHub: "Bengaluru Central Hub Depot"
    },
    {
      id: "BOX-BLR-106",
      qrCode: "BRISKETBOX-BOX-106",
      model: "Insulated Cold Bag",
      status: "sanitizing",
      currentOrderId: null,
      currentUserId: null,
      currentUserName: null,
      cyclesUsed: 26,
      lastSanitizedDate: "2026-10-29",
      depositAmount: 250,
      maxHoldingHours: 36,
      assignedHub: "Wash & UV Sanitization Bay"
    }
  ],
  orders: [],
  coolerReturns: []
};

class Database {
  constructor() {
    this.data = null;
    this.init();
  }

  init() {
    if (isProd) {
      this.data = {
        users: [],
        products: [],
        orders: [],
        coolers: [],
        coolerReturns: [],
        couponUsages: [],
        walletLedger: []
      };
      console.log('[DB] Production mode: MongoDB is the exclusive source of truth (no /tmp JSON fallback).');
      return;
    }
    try {
      if (DATA_FILE && fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        this.data = JSON.parse(raw);
        if (!this.data.coolers) this.data.coolers = [];
        if (!this.data.orders) this.data.orders = [];

        const box417 = this.data.coolers.find(c => c.id === 'BOX-BLR-417');
        if (!box417) {
          const init417 = INITIAL_DATA.coolers.find(c => c.id === 'BOX-BLR-417');
          if (init417) this.data.coolers.push({ ...init417 });
        } else {
          box417.currentOrderId = 'ORD-417-DELIVERED';
          box417.status = 'with_customer';
        }

        if (!this.data.orders.some(o => o.id === 'ORD-417-DELIVERED')) {
          const ord417 = INITIAL_DATA.orders.find(o => o.id === 'ORD-417-DELIVERED');
          if (ord417) this.data.orders.push({ ...ord417 });
        }

        // Clean any conflict where ORD-7740 took BOX-BLR-417
        const ord7740 = this.data.orders.find(o => o.id === 'ORD-7740');
        if (ord7740 && ord7740.coolerId === 'BOX-BLR-417') {
          ord7740.coolerId = 'BOX-BLR-774';
        }

        const box103 = this.data.coolers.find(c => c.id === 'BOX-BLR-103');
        if (!box103) {
          const init103 = INITIAL_DATA.coolers.find(c => c.id === 'BOX-BLR-103');
          if (init103) this.data.coolers.push({ ...init103 });
        } else {
          box103.currentOrderId = 'ORD-103-BREACH';
          box103.status = 'damaged';
          box103.maintenanceReason = 'Thermal gasket compromised • Sensor reached 5.8°C (>4.0°C safe limit)';
        }

        if (!this.data.orders.some(o => o.id === 'ORD-103-BREACH' || o.coolerId === 'BOX-BLR-103')) {
          const breachOrder = INITIAL_DATA.orders.find(o => o.id === 'ORD-103-BREACH');
          if (breachOrder) this.data.orders.push({ ...breachOrder });
        }

        // Guarantee default riders exist in users
        const defaultRiders = INITIAL_DATA.users.filter(u => u.role === 'rider');
        defaultRiders.forEach(r => {
          if (!this.data.users.some(u => u.email === r.email || u.id === r.id)) {
            this.data.users.push({ ...r });
          }
        });

        // Guarantee every order in persistent database has non-empty items array
        this.data.orders.forEach(o => {
          if (!o.items || !Array.isArray(o.items) || o.items.length === 0) {
            const initOrd = INITIAL_DATA.orders.find(io => io.id === o.id);
            if (initOrd && initOrd.items && initOrd.items.length > 0) {
              o.items = JSON.parse(JSON.stringify(initOrd.items));
            } else {
              o.items = [
                {
                  productId: 'prod_1',
                  name: 'Mangalore Surmai Steaks (Chilled 0°C-4°C)',
                  price: o.total ? Math.max(199, o.total - 250) : 499,
                  quantity: 1,
                  unit: '500g'
                }
              ];
            }
          }
        });

        this.save();
        console.log('[DB] Loaded BrisketBox database from persistence');
        return;
      }
      this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
      this.save();
      console.log('[DB] Initialized BrisketBox database');
    } catch (err) {
      console.error('[DB] Error initializing data:', err);
      this.data = JSON.parse(JSON.stringify(INITIAL_DATA));
      this.save();
    }
  }

  async syncWithMongo() {
    if (mongoose.connection.readyState !== 1) return;
    try {
      // Auto-seeding is strictly prohibited in production; only seed in dev if explicitly enabled
      if (!isProd && isDemoSeedEnabled) {
        const prodCount = await Product.countDocuments();
        if (prodCount === 0) {
          console.log('[MongoDB] Development mode: Seeding initial catalog into MongoDB...');
          await User.insertMany(INITIAL_DATA.users);
          await Product.insertMany(INITIAL_DATA.products);
          await Cooler.insertMany(INITIAL_DATA.coolers);
          await Order.insertMany(INITIAL_DATA.orders);
          await CoolerReturn.insertMany(INITIAL_DATA.coolerReturns);
          console.log('[MongoDB] Seeding into MongoDB complete.');
        }
      }

      // Sync from MongoDB collections
      const [users, products, coolers, orders, coolerReturns] = await Promise.all([
        User.find().lean(),
        Product.find().lean(),
        Cooler.find().lean(),
        Order.find().lean(),
        CoolerReturn.find().lean()
      ]);

      if (users.length) {
        this.data.users = users;
        // In dev, ensure default riders and partners exist
        if (!isProd && isDemoSeedEnabled) {
          const defaultRidersAndPartners = INITIAL_DATA.users.filter(u => u.role === 'rider' || u.role === 'partner');
          for (const r of defaultRidersAndPartners) {
            if (!this.data.users.some(u => u.email === r.email || u.id === r.id)) {
              this.data.users.push({ ...r });
              try {
                await User.create(r);
              } catch {}
            }
          }
        }
      }
      if (products.length) this.data.products = products;
      if (coolers.length) this.data.coolers = coolers;
      if (orders.length) this.data.orders = orders;
      if (coolerReturns.length) this.data.coolerReturns = coolerReturns;
      this.save();
      console.log('[MongoDB] Successfully synchronized cache with live MongoDB.');
    } catch (err) {
      console.error('[MongoDB] Error synchronizing with MongoDB:', err);
    }
  }

  save() {
    if (isProd || !DATA_FILE || process.env.NODE_ENV === 'test') {
      return; // Never write JSON documents in production or test runs
    }
    try {
      fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Error writing data file:', err);
    }
  }

  get(collection) {
    return this.data[collection] || [];
  }

  findById(collection, id) {
    return (this.data[collection] || []).find(item => item.id === id);
  }

  insert(collection, item) {
    if (!this.data[collection]) {
      this.data[collection] = [];
    }
    this.data[collection].unshift(item);
    this.save();

    // In production, MongoDB is the exclusive source of truth
    if (isProd && mongoose.connection.readyState !== 1) {
      throw new Error('Database connection is offline');
    }
    // Persist to MongoDB if connected
    if (mongoose.connection.readyState === 1) {
      const Model = getModel(collection);
      if (Model) {
        const mongoItem = { ...item };
        if (collection === 'coolers' && !mongoItem.coolerCode) {
          mongoItem.coolerCode = mongoItem.qrCode || mongoItem.id;
        }
        if (collection === 'orders') {
          if (!mongoItem.orderNumber) mongoItem.orderNumber = mongoItem.id;
          if (mongoItem.totalAmount === undefined) mongoItem.totalAmount = mongoItem.total || 0;
        }
        Model.create(mongoItem).catch(err => console.error(`[MongoDB] Error inserting into ${collection}:`, err.message));
      }
    }
    return item;
  }

  update(collection, id, updates) {
    const list = this.data[collection] || [];
    const idx = list.findIndex(item => item.id === id);
    if (idx !== -1) {
      list[idx] = { ...list[idx], ...updates };
      this.save();

      // Persist to MongoDB asynchronously if connected
      if (mongoose.connection.readyState === 1) {
        const Model = getModel(collection);
        if (Model) {
          Model.updateOne({ id }, { $set: updates }).catch(err => console.error(`[MongoDB] Error updating ${collection}:`, err.message));
        }
      }
      return list[idx];
    }
    return null;
  }

  delete(collection, id) {
    const list = this.data[collection] || [];
    const idx = list.findIndex(item => item.id === id);
    if (idx !== -1) {
      const removed = list.splice(idx, 1)[0];
      this.save();

      // Persist to MongoDB asynchronously if connected
      if (mongoose.connection.readyState === 1) {
        const Model = getModel(collection);
        if (Model) {
          Model.deleteOne({ id }).catch(err => console.error(`[MongoDB] Error deleting from ${collection}:`, err.message));
        }
      }
      return removed;
    }
    return null;
  }
}

export const db = new Database();
