import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectMongoDB, User, Product, Order, Cooler, CoolerReturn } from '../mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data.json');

/**
 * Enterprise Safe MongoDB Migration Script
 * Migrates data from local data.json into MongoDB.
 * IDEMPOTENT: Checks for existing documents and NEVER overwrites existing data.
 */
export async function runMigration() {
  console.log('--- STARTING BRISKETBOX MONGODB SAFE MIGRATION ---');

  if (!fs.existsSync(DATA_FILE)) {
    console.error(`[Migration Error] Data file not found at: ${DATA_FILE}`);
    process.exit(1);
  }

  let sourceData;
  try {
    sourceData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (err) {
    console.error(`[Migration Error] Failed to parse ${DATA_FILE}:`, err.message);
    process.exit(1);
  }

  await connectMongoDB();

  if (mongoose.connection.readyState !== 1) {
    console.error('[Migration Error] Cannot run migration: MongoDB is not connected.');
    process.exit(1);
  }

  const stats = {
    users: { inserted: 0, skipped: 0 },
    products: { inserted: 0, skipped: 0 },
    coolers: { inserted: 0, skipped: 0 },
    orders: { inserted: 0, skipped: 0 },
    coolerReturns: { inserted: 0, skipped: 0 }
  };

  // 1. Migrate Users
  if (Array.isArray(sourceData.users)) {
    for (const u of sourceData.users) {
      const existing = await User.findOne({
        $or: [{ id: u.id }, { email: u.email.toLowerCase() }]
      });
      if (existing) {
        stats.users.skipped++;
      } else {
        const { _id, ...cleanUser } = u;
        await User.create({
          ...cleanUser,
          email: cleanUser.email.toLowerCase()
        });
        stats.users.inserted++;
      }
    }
  }

  // 2. Migrate Products
  if (Array.isArray(sourceData.products)) {
    for (const p of sourceData.products) {
      const existing = await Product.findOne({ id: p.id });
      if (existing) {
        stats.products.skipped++;
      } else {
        const { _id, ...cleanProd } = p;
        await Product.create(cleanProd);
        stats.products.inserted++;
      }
    }
  }

  // 3. Migrate Coolers
  if (Array.isArray(sourceData.coolers)) {
    for (const c of sourceData.coolers) {
      const existing = await Cooler.findOne({ id: c.id });
      if (existing) {
        stats.coolers.skipped++;
      } else {
        const { _id, ...cleanCooler } = c;
        if (!cleanCooler.coolerCode) {
          cleanCooler.coolerCode = cleanCooler.qrCode || cleanCooler.id;
        }
        await Cooler.create(cleanCooler);
        stats.coolers.inserted++;
      }
    }
  }

  // 4. Migrate Orders
  if (Array.isArray(sourceData.orders)) {
    for (const o of sourceData.orders) {
      const orderNum = o.orderNumber || o.id;
      const existing = await Order.findOne({
        $or: [{ id: o.id }, { orderNumber: orderNum }]
      });
      if (existing) {
        stats.orders.skipped++;
      } else {
        const { _id, ...cleanOrder } = o;
        if (!cleanOrder.orderNumber) cleanOrder.orderNumber = orderNum;
        if (cleanOrder.totalAmount === undefined) cleanOrder.totalAmount = cleanOrder.total || 0;
        await Order.create(cleanOrder);
        stats.orders.inserted++;
      }
    }
  }

  // 5. Migrate Cooler Returns
  if (Array.isArray(sourceData.coolerReturns)) {
    for (const cr of sourceData.coolerReturns) {
      const existing = await CoolerReturn.findOne({ id: cr.id });
      if (existing) {
        stats.coolerReturns.skipped++;
      } else {
        const { _id, ...cleanReturn } = cr;
        await CoolerReturn.create(cleanReturn);
        stats.coolerReturns.inserted++;
      }
    }
  }

  console.log('\n--- MIGRATION SUMMARY (Zero Overwrites) ---');
  console.log(`Users:         ${stats.users.inserted} inserted, ${stats.users.skipped} existing skipped`);
  console.log(`Products:      ${stats.products.inserted} inserted, ${stats.products.skipped} existing skipped`);
  console.log(`Coolers:       ${stats.coolers.inserted} inserted, ${stats.coolers.skipped} existing skipped`);
  console.log(`Orders:        ${stats.orders.inserted} inserted, ${stats.orders.skipped} existing skipped`);
  console.log(`CoolerReturns: ${stats.coolerReturns.inserted} inserted, ${stats.coolerReturns.skipped} existing skipped`);
  console.log('--- MIGRATION FINISHED SUCCESSFULLY ---');

  return stats;
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  runMigration()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Migration Error]:', err.message);
      process.exit(1);
    });
}
