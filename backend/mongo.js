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

let isConnected = false;

export async function connectMongoDB() {
  const isProd = process.env.NODE_ENV === 'production';
  const uri = process.env.MONGODB_URI || (isProd ? '' : 'mongodb://127.0.0.1:27017/brisketbox');
  if (isProd && !uri) {
    throw new Error('[FATAL] MONGODB_URI is required in production environment.');
  }
  
  try {
    mongoose.set('strictQuery', false);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    isConnected = true;
    console.log(`[MongoDB] Connected successfully to: ${mongoose.connection.host}/${mongoose.connection.name}`);
    return true;
  } catch (err) {
    isConnected = false;
    console.warn(`[MongoDB] Connection notice (${err.message}).`);
    console.warn(`[MongoDB] Running with local persistent document store fallback.`);
    return false;
  }
}

export function getMongoStatus() {
  const states = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
  const stateIndex = mongoose.connection.readyState;
  return {
    configuredUri: process.env.MONGODB_URI ? 'Configured in environment' : 'mongodb://127.0.0.1:27017/brisketbox (local default)',
    status: states[stateIndex] || 'Disconnected',
    isConnected: stateIndex === 1,
    host: mongoose.connection.host || null,
    dbName: mongoose.connection.name || null,
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
