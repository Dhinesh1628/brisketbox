import mongoose from 'mongoose';
import dns from 'dns';
import { User } from './models/User.js';
import { Product } from './models/Product.js';
import { Order } from './models/Order.js';
import { Cooler } from './models/Cooler.js';
import { CoolerReturn } from './models/CoolerReturn.js';

// Resolve MongoDB SRV records reliably across all Windows/ISP networks
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {
  // Ignore if custom DNS cannot be set
}

// Global Mongoose connection cache for serverless (Vercel) connection reuse
let cached = global.mongoose;
if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectMongoDB() {
  const isProd = process.env.NODE_ENV === 'production';
  const uri = process.env.MONGODB_URI || (isProd ? '' : 'mongodb://127.0.0.1:27017/brisketbox');

  if (isProd && !uri) {
    throw new Error('[FATAL] MONGODB_URI is strictly required in production environment.');
  }

  // If already connected, return cached connection immediately
  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    mongoose.set('strictQuery', false);
    const opts = {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
      bufferCommands: false
    };

    cached.promise = mongoose.connect(uri, opts).then((m) => {
      console.log(`[MongoDB] Connected successfully to: ${m.connection.host}/${m.connection.name}`);
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    if (isProd) {
      // In production, startup must fail immediately if MongoDB cannot connect
      throw new Error(`[FATAL] Failed to connect to MongoDB in production: ${err.message}`);
    }
    console.warn(`[MongoDB] Connection notice (${err.message}). Running with local persistent document store in non-production.`);
    return null;
  }
}

export function isMongoConnected() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

export function getMongoStatus() {
  const states = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
  const stateIndex = mongoose.connection ? mongoose.connection.readyState : 0;
  return {
    configuredUri: process.env.MONGODB_URI ? 'Configured in environment' : 'mongodb://127.0.0.1:27017/brisketbox (local default)',
    status: states[stateIndex] || 'Disconnected',
    isConnected: stateIndex === 1,
    host: mongoose.connection?.host || null,
    dbName: mongoose.connection?.name || null,
    collections: ['users', 'products', 'orders', 'coolers', 'coolerreturns']
  };
}

export {
  User,
  Product,
  Order,
  Cooler,
  CoolerReturn
};
