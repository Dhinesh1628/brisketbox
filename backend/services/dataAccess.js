import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { Cooler } from '../models/Cooler.js';
import { CoolerReturn } from '../models/CoolerReturn.js';
import { Contact } from '../models/Contact.js';
import { db } from '../db.js';

const isProd = process.env.NODE_ENV === 'production';

function ensureOnline() {
  if (isProd && (!mongoose.connection || mongoose.connection.readyState !== 1)) {
    const err = new Error('Database connection is offline');
    err.statusCode = 503;
    throw err;
  }
}

const isMongo = () => Boolean(mongoose.connection && mongoose.connection.readyState === 1);

// Helper for memory filter
function matchFilter(filter) {
  return (item) => {
    for (const [key, val] of Object.entries(filter)) {
      if (typeof val === 'object' && val !== null) {
        if (val.$in && !val.$in.includes(item[key])) return false;
        if (val.$ne !== undefined && item[key] === val.$ne) return false;
      } else if (item[key] !== val) {
        return false;
      }
    }
    return true;
  };
}

// =========================================================================
// USERS
// =========================================================================
export async function findUser(filter) {
  ensureOnline();
  if (isMongo()) {
    return await User.findOne(filter).lean();
  }
  return (db.get('users') || []).find(matchFilter(filter)) || null;
}

export async function findUserById(id) {
  ensureOnline();
  if (isMongo()) {
    return await User.findOne({ id }).lean();
  }
  return db.findById('users', id) || null;
}

export async function findUsers(filter = {}) {
  ensureOnline();
  if (isMongo()) {
    return await User.find(filter).lean();
  }
  return (db.get('users') || []).filter(matchFilter(filter));
}

export async function createUser(doc) {
  ensureOnline();
  if (isMongo()) {
    const created = await User.create(doc);
    return created.toObject ? created.toObject() : created;
  }
  return db.insert('users', doc);
}

export async function updateUser(id, updates) {
  ensureOnline();
  if (isMongo()) {
    return await User.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  }
  return db.update('users', id, updates);
}

// =========================================================================
// PRODUCTS
// =========================================================================
export async function findProducts(filter = {}) {
  ensureOnline();
  if (isMongo()) {
    return await Product.find(filter).lean();
  }
  return (db.get('products') || []).filter(matchFilter(filter));
}

export async function findProductById(id) {
  ensureOnline();
  if (isMongo()) {
    return await Product.findOne({ id }).lean();
  }
  return db.findById('products', id) || null;
}

export async function createProduct(doc) {
  ensureOnline();
  if (isMongo()) {
    const created = await Product.create(doc);
    return created.toObject ? created.toObject() : created;
  }
  return db.insert('products', doc);
}

export async function updateProduct(id, updates) {
  ensureOnline();
  if (isMongo()) {
    return await Product.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  }
  return db.update('products', id, updates);
}

export async function deleteProduct(id) {
  ensureOnline();
  if (isMongo()) {
    return await Product.findOneAndDelete({ id }).lean();
  }
  return db.delete('products', id);
}

// =========================================================================
// ORDERS
// =========================================================================
export async function findOrders(filter = {}, sort = { createdAt: -1 }) {
  ensureOnline();
  if (isMongo()) {
    return await Order.find(filter).sort(sort).lean();
  }
  return (db.get('orders') || []).filter(matchFilter(filter));
}

export async function findOrderById(id) {
  ensureOnline();
  if (isMongo()) {
    return await Order.findOne({
      $or: [{ id }, { orderNumber: id }]
    }).lean();
  }
  return (db.get('orders') || []).find(o => o.id === id || o.orderNumber === id) || null;
}

export async function findOrder(filter) {
  ensureOnline();
  if (isMongo()) {
    return await Order.findOne(filter).lean();
  }
  return (db.get('orders') || []).find(matchFilter(filter)) || null;
}

export async function createOrder(doc) {
  ensureOnline();
  if (isMongo()) {
    const created = await Order.create(doc);
    return created.toObject ? created.toObject() : created;
  }
  return db.insert('orders', doc);
}

export async function updateOrder(id, updates) {
  ensureOnline();
  if (isMongo()) {
    return await Order.findOneAndUpdate(
      { $or: [{ id }, { orderNumber: id }] },
      { $set: updates },
      { new: true }
    ).lean();
  }
  return db.update('orders', id, updates);
}

// =========================================================================
// COOLERS
// =========================================================================
export async function findCoolers(filter = {}) {
  ensureOnline();
  if (isMongo()) {
    return await Cooler.find(filter).lean();
  }
  return (db.get('coolers') || []).filter(matchFilter(filter));
}

export async function findCoolerById(id) {
  ensureOnline();
  if (isMongo()) {
    return await Cooler.findOne({ id }).lean();
  }
  return db.findById('coolers', id) || null;
}

export async function createCooler(doc) {
  ensureOnline();
  if (isMongo()) {
    const created = await Cooler.create(doc);
    return created.toObject ? created.toObject() : created;
  }
  return db.insert('coolers', doc);
}

export async function updateCooler(id, updates) {
  ensureOnline();
  if (isMongo()) {
    return await Cooler.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  }
  return db.update('coolers', id, updates);
}

// =========================================================================
// COOLER RETURNS
// =========================================================================
export async function findCoolerReturns(filter = {}) {
  ensureOnline();
  if (isMongo()) {
    return await CoolerReturn.find(filter).lean();
  }
  return (db.get('coolerReturns') || []).filter(matchFilter(filter));
}

export async function findCoolerReturnById(id) {
  ensureOnline();
  if (isMongo()) {
    return await CoolerReturn.findOne({ id }).lean();
  }
  return db.findById('coolerReturns', id) || null;
}

export async function createCoolerReturn(doc) {
  ensureOnline();
  if (isMongo()) {
    const created = await CoolerReturn.create(doc);
    return created.toObject ? created.toObject() : created;
  }
  return db.insert('coolerReturns', doc);
}

export async function updateCoolerReturn(id, updates) {
  ensureOnline();
  if (isMongo()) {
    return await CoolerReturn.findOneAndUpdate({ id }, { $set: updates }, { new: true }).lean();
  }
  return db.update('coolerReturns', id, updates);
}

// =========================================================================
// CONTACTS / TICKETS
// =========================================================================
export async function findContacts(filter = {}) {
  ensureOnline();
  if (isMongo()) {
    return await Contact.find(filter).lean();
  }
  return (db.get('contacts') || []).filter(matchFilter(filter));
}

export async function createContact(doc) {
  ensureOnline();
  if (isMongo()) {
    const created = await Contact.create(doc);
    return created.toObject ? created.toObject() : created;
  }
  return db.insert('contacts', doc);
}
