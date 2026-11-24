import app from '../backend/server.js';
import { connectMongoDB } from '../backend/mongo.js';

export default async function handler(req, res) {
  try {
    await connectMongoDB();
  } catch (err) {
    console.warn('[Vercel Handler] MongoDB connection error:', err.message);
  }
  return app(req, res);
}
