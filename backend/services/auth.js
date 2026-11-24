import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { db } from '../db.js';

export function validateProductionEnv() {
  if (process.env.NODE_ENV === 'production') {
    const requiredVars = [
      'JWT_SECRET',
      'MONGODB_URI'
    ];

    const missing = requiredVars.filter(v => !process.env[v] || process.env[v].trim() === '');
    if (missing.length > 0) {
      console.warn(`[CONFIGURATION WARNING] Recommended production environment variables missing: ${missing.join(', ')}`);
    }
  }
}

export function getJwtSecret() {
  return process.env.JWT_SECRET || 'brisketbox-production-secure-fallback-secret-2026';
}

export function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...val] = cookie.trim().split('=');
    if (!name) return acc;
    acc[name] = decodeURIComponent(val.join('='));
    return acc;
  }, {});
}

export function getAuthTokenFromReq(req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1].trim();
  }
  const cookies = parseCookies(req.headers?.cookie);
  if (cookies.token) {
    return cookies.token.trim();
  }
  return null;
}

export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = [
    `token=${token}`,
    'HttpOnly',
    'Path=/',
    `Max-Age=${2 * 60 * 60}`, // 2 hours
    'SameSite=Lax'
  ];
  if (isProd) {
    cookieOptions.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieOptions.join('; '));
}

export function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = [
    'token=',
    'HttpOnly',
    'Path=/',
    'Max-Age=0',
    'SameSite=Lax'
  ];
  if (isProd) {
    cookieOptions.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieOptions.join('; '));
}

export function createToken(user, options = {}) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    shopId: user.shopId
  };

  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: options.expiresIn || '2h' // Shorter-lived tokens for production hardening
  });
}

export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export const authenticate = async (req, res, next) => {
  const token = getAuthTokenFromReq(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. No token provided.' });
  }

  try {
    const decoded = verifyToken(token);
    let user = null;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      user = await User.findOne({ id: decoded.id }).lean();
    } else if (process.env.NODE_ENV !== 'production') {
      user = db.findById('users', decoded.id);
    }
    if (!user) {
      return res.status(401).json({ error: 'User account not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
};

export const authenticateOptional = async (req, res, next) => {
  const token = getAuthTokenFromReq(req);
  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = verifyToken(token);
    let user = null;
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      user = await User.findOne({ id: decoded.id }).lean();
    } else if (process.env.NODE_ENV !== 'production') {
      user = db.findById('users', decoded.id);
    }
    req.user = user || null;
  } catch (err) {
    req.user = null;
  }
  next();
};

export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Operations admin permissions required' });
  }
  next();
};

export const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || (!roles.includes(req.user.role) && req.user.role !== 'admin')) {
    return res.status(403).json({ error: `Access forbidden: Requires ${roles.join(' or ')} permission` });
  }
  next();
};

export const requireApproved = (req, res, next) => {
  if (['rider', 'partner'].includes(req.user?.role) && req.user.approvalStatus !== 'approved' && req.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Your account is pending administrator approval. Please wait for operations verification.',
      approvalStatus: req.user.approvalStatus || 'pending_approval'
    });
  }
  next();
};
