import { db } from '../db.js';

let stockOperationMutex = Promise.resolve();

/**
 * Executes a callback with sequential mutex lock to prevent concurrent stock race conditions.
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
 * @param {Array<{ productId: string, quantity: number }>} items
 * @returns {Promise<{ success: boolean, deductedItems: Array }>}
 */
export async function deductStock(items) {
  return withStockLock(async () => {
    if (!Array.isArray(items) || items.length === 0) return { success: true, deductedItems: [] };

    // Pass 1: Verify all items have sufficient available stock
    for (const item of items) {
      const prod = db.findById('products', item.productId);
      if (!prod) {
        throw new Error(`Product "${item.productId}" not found in stock directory`);
      }
      if (prod.stock < item.quantity) {
        throw new Error(`Insufficient stock for "${prod.name}". Only ${prod.stock} remaining (requested ${item.quantity}).`);
      }
    }

    // Pass 2: Atomically deduct stock
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
 * @returns {Promise<{ success: boolean }>}
 */
export async function releaseStock(items) {
  return withStockLock(async () => {
    if (!Array.isArray(items) || items.length === 0) return { success: true };

    for (const item of items) {
      const prod = db.findById('products', item.productId);
      if (prod) {
        const restoredStock = (prod.stock || 0) + item.quantity;
        db.update('products', prod.id, { stock: restoredStock });
      }
    }

    return { success: true };
  });
}
