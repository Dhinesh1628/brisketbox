import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { connectMongoDB, User, Product, Order, Cooler, CoolerReturn } from '../mongo.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../data.json');

/**
 * Rejects all demo records, test data, and fake phone numbers.
 */
export function isDemoRecord(doc) {
  if (!doc) return false;
  if (doc.isDemo) return true;
  const str = JSON.stringify(doc).toLowerCase();
  // Fake / dummy sequential phone numbers
  if (/98765\s?43210|98765\s?00000|99999\s?99999|99999\s?11111|12345\s?67890/.test(str)) return true;
  // Demo or test email domains
  if (/@(example\.com|test\.com)/i.test(doc.email || doc.customerEmail || '')) return true;
  // Demo order prefixes or notes
  if (/^(ord-)?(demo|test|breach)/i.test(doc.id || doc.orderNumber || '')) return true;
  if (doc.notes && /demo|test/i.test(doc.notes)) return true;
  return false;
}

/**
 * Enterprise Safe MongoDB Migration Script
 * Migrates data from local data.json into MongoDB.
 * DRY-RUN by default; requires --commit flag to write.
 * IDEMPOTENT: Checks for existing documents and NEVER overwrites existing data.
 * Validates all records before writing. Refuses all demo records.
 */
export async function runMigration(options = {}) {
  const isCommit = options.commit !== undefined ? options.commit : process.argv.includes('--commit');
  console.log(`--- BRISKETBOX MONGODB MIGRATION [${isCommit ? 'LIVE COMMIT MODE' : 'DRY RUN MODE (No writes)'}] ---`);

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
    users: { valid: 0, invalid: 0, inserted: 0, skipped: 0 },
    products: { valid: 0, invalid: 0, inserted: 0, skipped: 0 },
    coolers: { valid: 0, invalid: 0, inserted: 0, skipped: 0 },
    orders: { valid: 0, invalid: 0, inserted: 0, skipped: 0 },
    coolerReturns: { valid: 0, invalid: 0, inserted: 0, skipped: 0 }
  };

  // 1. Migrate Users
  if (Array.isArray(sourceData.users)) {
    for (const u of sourceData.users) {
      if (isDemoRecord(u)) {
        console.warn(`[Migration Refused] Demo user record refused: ${u.id || u.email}`);
        stats.users.refused = (stats.users.refused || 0) + 1;
        continue;
      }
      const { _id, ...cleanUser } = u;
      cleanUser.email = (cleanUser.email || '').toLowerCase();
      const userDoc = new User(cleanUser);
      const validationError = userDoc.validateSync();
      if (validationError) {
        console.warn(`[Validation Warning] User ${u.id || u.email} invalid: ${validationError.message}`);
        stats.users.invalid++;
        continue;
      }
      stats.users.valid++;

      const existing = await User.findOne({
        $or: [{ id: u.id }, { email: cleanUser.email }]
      });
      if (existing) {
        stats.users.skipped++;
      } else {
        if (isCommit) {
          await User.create(cleanUser);
        }
        stats.users.inserted++;
      }
    }
  }

  // 2. Migrate Products
  if (Array.isArray(sourceData.products)) {
    for (const p of sourceData.products) {
      const { _id, ...cleanProd } = p;
      const prodDoc = new Product(cleanProd);
      const validationError = prodDoc.validateSync();
      if (validationError) {
        console.warn(`[Validation Warning] Product ${p.id} invalid: ${validationError.message}`);
        stats.products.invalid++;
        continue;
      }
      stats.products.valid++;

      const existing = await Product.findOne({ id: p.id });
      if (existing) {
        stats.products.skipped++;
      } else {
        if (isCommit) {
          await Product.create(cleanProd);
        }
        stats.products.inserted++;
      }
    }
  }

  // 3. Migrate Coolers
  if (Array.isArray(sourceData.coolers)) {
    for (const c of sourceData.coolers) {
      const { _id, ...cleanCooler } = c;
      if (!cleanCooler.coolerCode) {
        cleanCooler.coolerCode = cleanCooler.qrCode || cleanCooler.id;
      }
      const coolerDoc = new Cooler(cleanCooler);
      const validationError = coolerDoc.validateSync();
      if (validationError) {
        console.warn(`[Validation Warning] Cooler ${c.id} invalid: ${validationError.message}`);
        stats.coolers.invalid++;
        continue;
      }
      stats.coolers.valid++;

      const existing = await Cooler.findOne({ id: c.id });
      if (existing) {
        stats.coolers.skipped++;
      } else {
        if (isCommit) {
          await Cooler.create(cleanCooler);
        }
        stats.coolers.inserted++;
      }
    }
  }

  // 4. Migrate Orders
  if (Array.isArray(sourceData.orders)) {
    for (const o of sourceData.orders) {
      const orderNum = o.orderNumber || o.id;
      if (isDemoRecord(o)) {
        console.warn(`[Migration Refused] Demo order record refused: ${orderNum}`);
        stats.orders.refused = (stats.orders.refused || 0) + 1;
        continue;
      }
      const { _id, ...cleanOrder } = o;
      if (!cleanOrder.orderNumber) cleanOrder.orderNumber = orderNum;
      if (cleanOrder.totalAmount === undefined) cleanOrder.totalAmount = cleanOrder.total || 0;
      
      const orderDoc = new Order(cleanOrder);
      const validationError = orderDoc.validateSync();
      if (validationError) {
        console.warn(`[Validation Warning] Order ${orderNum} invalid: ${validationError.message}`);
        stats.orders.invalid++;
        continue;
      }
      stats.orders.valid++;

      const existing = await Order.findOne({
        $or: [{ id: o.id }, { orderNumber: orderNum }]
      });
      if (existing) {
        stats.orders.skipped++;
      } else {
        if (isCommit) {
          await Order.create(cleanOrder);
        }
        stats.orders.inserted++;
      }
    }
  }

  // 5. Migrate Cooler Returns
  if (Array.isArray(sourceData.coolerReturns)) {
    for (const cr of sourceData.coolerReturns) {
      const { _id, ...cleanReturn } = cr;
      const returnDoc = new CoolerReturn(cleanReturn);
      const validationError = returnDoc.validateSync();
      if (validationError) {
        console.warn(`[Validation Warning] CoolerReturn ${cr.id} invalid: ${validationError.message}`);
        stats.coolerReturns.invalid++;
        continue;
      }
      stats.coolerReturns.valid++;

      const existing = await CoolerReturn.findOne({ id: cr.id });
      if (existing) {
        stats.coolerReturns.skipped++;
      } else {
        if (isCommit) {
          await CoolerReturn.create(cleanReturn);
        }
        stats.coolerReturns.inserted++;
      }
    }
  }

  console.log(`\n--- MIGRATION SUMMARY [${isCommit ? 'WRITTEN' : 'DRY RUN ONLY'}] ---`);
  console.log(`Users:         ${stats.users.inserted} ${isCommit ? 'inserted' : 'would insert'}, ${stats.users.skipped} skipped, ${stats.users.invalid} invalid`);
  console.log(`Products:      ${stats.products.inserted} ${isCommit ? 'inserted' : 'would insert'}, ${stats.products.skipped} skipped, ${stats.products.invalid} invalid`);
  console.log(`Coolers:       ${stats.coolers.inserted} ${isCommit ? 'inserted' : 'would insert'}, ${stats.coolers.skipped} skipped, ${stats.coolers.invalid} invalid`);
  console.log(`Orders:        ${stats.orders.inserted} ${isCommit ? 'inserted' : 'would insert'}, ${stats.orders.skipped} skipped, ${stats.orders.invalid} invalid`);
  console.log(`CoolerReturns: ${stats.coolerReturns.inserted} ${isCommit ? 'inserted' : 'would insert'}, ${stats.coolerReturns.skipped} skipped, ${stats.coolerReturns.invalid} invalid`);
  if (!isCommit) {
    console.log('[NOTE] Dry run complete. Zero database writes performed. Pass --commit to write.');
  }
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
