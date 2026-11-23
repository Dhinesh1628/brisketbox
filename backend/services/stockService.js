import mongoose from 'mongoose';
import { Product } from '../models/Product.js';
import { db } from '../db.js';

let stockOperationMutex = Promise.resolve();

/**
 * Sequential mutex lock to prevent concurrent stock race conditions in local memory fallback.
 */
function withStockLock(callback) {
  const nextLock = stockOperationMutex.then(async () => {
    try {
      return await callback();
    } catch (err) {
      throw err;
    }
  });
  stockOperationMutex = nextLock.catch(() => {});
  return nextLock;
}

/**
 * Atomically verifies and deducts inventory stock for order items.
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
  return withStockLock(async () => {
    if (!Array.isArray(items) || items.length === 0) return { success: true, deductedItems: [] };

    const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
    const session = options.session || null;

    if (isMongo) {
      const deducted = [];
      try {
        for (const item of items) {
          const qty = Number(item.quantity) || 1;
          const query = Product.findOneAndUpdate(
            { id: item.productId, stock: { $gte: qty } },
            { $inc: { stock: -qty } },
            { new: true, session }
          );
          const updated = await query;

          if (!updated) {
            const current = await Product.findOne({ id: item.productId }).session(session);
            throw new Error(`Insufficient stock for "${current?.name || item.productId}". Only ${current?.stock || 0} remaining (requested ${qty}).`);
          }

          deducted.push({ productId: item.productId, quantity: qty });
        }
        return { success: true, deductedItems: deducted };
      } catch (err) {
        // Rollback any items deducted in this partial batch if not using an aborted session
        if (!session) {
          for (const rolled of deducted) {
            await Product.findOneAndUpdate(
              { id: rolled.productId },
              { $inc: { stock: rolled.quantity } }
            );
          }
        }
        throw err;
      }
    }

    // LowDB fallback (only active when MongoDB is not connected)
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
  });
}

/**
 * Releases previously reserved/deducted stock back to inventory.
 * Used when an online payment fails, expires, or an order is cancelled.
 *
 * @param {Array<{ productId: string, quantity: number }>} items
 * @param {{ session?: mongoose.ClientSession }} [options]
 * @returns {Promise<{ success: boolean }>}
 */
export async function releaseStock(items, options = {}) {
  return withStockLock(async () => {
    if (!Array.isArray(items) || items.length === 0) return { success: true };

    const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
    const session = options.session || null;

    for (const item of items) {
      const qty = Number(item.quantity) || 1;
      if (isMongo) {
        await Product.findOneAndUpdate(
          { id: item.productId },
          { $inc: { stock: qty } },
          { session }
        );
      } else {
        const prod = db.findById('products', item.productId);
        if (prod) {
          const restoredStock = (prod.stock || 0) + qty;
          db.update('products', prod.id, { stock: restoredStock });
        }
      }
    }

    return { success: true };
  });
}
