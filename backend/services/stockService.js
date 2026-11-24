import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { db } from '../db.js';

/**
 * Atomically verifies and deducts inventory stock for order items using MongoDB transactions.
 * If any single product has insufficient stock, the entire transaction is aborted
 * and no inventory is deducted.
 *
 * In production with MongoDB connected, executes atomic conditional updates ($inc with $gte).
 * Never executes $set from local memory after an atomic $inc.
 *
 * @param {Array<{ productId: string, quantity: number }>} items
 * @param {{ session?: mongoose.ClientSession }} [options]
 * @returns {Promise<{ success: boolean, deductedItems: Array }>}
 */
export async function deductStock(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return { success: true, deductedItems: [] };

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;

  if (isMongo) {
    const executeInSession = async (session) => {
      const deducted = [];
      for (const item of items) {
        const qty = Number(item.quantity) || 1;
        const updated = await Product.findOneAndUpdate(
          { id: item.productId, stock: { $gte: qty } },
          { $inc: { stock: -qty } },
          { new: true, session }
        );

        if (!updated) {
          const current = await Product.findOne({ id: item.productId }).session(session);
          throw new Error(`Insufficient stock for "${current?.name || item.productId}". Only ${current?.stock || 0} remaining (requested ${qty}).`);
        }

        deducted.push({ productId: item.productId, quantity: qty });
      }
      return { success: true, deductedItems: deducted };
    };

    if (options.session) {
      return await executeInSession(options.session);
    } else {
      const ownSession = await mongoose.startSession();
      try {
        let result = null;
        await ownSession.withTransaction(async () => {
          result = await executeInSession(ownSession);
        });
        return result;
      } finally {
        await ownSession.endSession();
      }
    }
  }

  // LowDB fallback (only active when MongoDB is not connected in local non-prod)
  for (const item of items) {
    const prod = db.findById('products', item.productId);
    if (!prod) {
      throw new Error(`Product "${item.productId}" not found in stock directory`);
    }
    if (prod.stock < item.quantity) {
      throw new Error(`Insufficient stock for "${prod.name}". Only ${prod.stock} remaining (requested ${item.quantity}).`);
    }
  }

  const deducted = [];
  for (const item of items) {
    const prod = db.findById('products', item.productId);
    const newStock = Math.max(0, prod.stock - item.quantity);
    db.update('products', prod.id, { stock: newStock });
    deducted.push({ productId: prod.id, quantity: item.quantity, previousStock: prod.stock, newStock });
  }

  return { success: true, deductedItems: deducted };
}

/**
 * Releases previously reserved/deducted stock back to inventory.
 * Used when an online payment fails, expires, or an order is cancelled.
 *
 * @param {Array<{ productId: string, quantity: number }>} items
 * @param {{ session?: mongoose.ClientSession }} [options]
 * @returns {Promise<{ success: boolean, restoredItems: Array }>}
 */
export async function releaseStock(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) return { success: true, restoredItems: [] };

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  const session = options.session || null;

  if (isMongo) {
    const restored = [];
    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      await Product.findOneAndUpdate(
        { id: item.productId },
        { $inc: { stock: qty } },
        { new: true, session }
      );
      restored.push({ productId: item.productId, quantity: qty });
    }
    return { success: true, restoredItems: restored };
  }

  // LowDB fallback
  const restored = [];
  for (const item of items) {
    const prod = db.findById('products', item.productId);
    if (prod) {
      const newStock = prod.stock + item.quantity;
      db.update('products', prod.id, { stock: newStock });
      restored.push({ productId: prod.id, quantity: item.quantity, previousStock: prod.stock, newStock });
    }
  }
  return { success: true, restoredItems: restored };
}
