import mongoose from 'mongoose';
import { db } from '../db.js';
import { CouponUsage } from '../models/CouponUsage.js';
import { v4 as uuidv4 } from 'uuid';

export const COUPON_REGISTRY = {
  'WELCOME50': {
    code: 'WELCOME50',
    description: 'Flat ₹50 OFF on orders above ₹299',
    type: 'flat',
    discount: 50,
    minOrderValue: 299,
    maxDiscount: 50,
    maxPerUser: 1,
    maxTotalUsage: 10000,
    isActive: true,
    validUntil: '2028-12-31T23:59:59.000Z'
  },
  'BRISKET100': {
    code: 'BRISKET100',
    description: 'Flat ₹100 OFF on orders above ₹799',
    type: 'flat',
    discount: 100,
    minOrderValue: 799,
    maxDiscount: 100,
    maxPerUser: 1,
    maxTotalUsage: 5000,
    isActive: true,
    validUntil: '2028-12-31T23:59:59.000Z'
  },
  'FREESHIP': {
    code: 'FREESHIP',
    description: 'Free Chilled Delivery (₹40 OFF) on orders above ₹249',
    type: 'flat',
    discount: 40,
    minOrderValue: 249,
    maxDiscount: 40,
    maxPerUser: 3,
    maxTotalUsage: 20000,
    isActive: true,
    validUntil: '2028-12-31T23:59:59.000Z'
  },
  'MEATFEAST': {
    code: 'MEATFEAST',
    description: '10% OFF up to ₹150 on feast orders above ₹599',
    type: 'percentage',
    discountPercent: 10,
    minOrderValue: 599,
    maxDiscount: 150,
    maxPerUser: 2,
    maxTotalUsage: 5000,
    isActive: true,
    validUntil: '2028-12-31T23:59:59.000Z'
  }
};

/**
 * Validates a coupon code against business rules on the server.
 * Never trusts any client-provided discount amount.
 *
 * @param {string} rawCode
 * @param {object} user - Authenticated user object or guest
 * @param {number} subtotal - Server-computed subtotal in INR
 * @param {mongoose.ClientSession} [session]
 * @returns {Promise<{ valid: boolean, discount: number, coupon?: object, error?: string }>}
 */
export async function validateAndApplyCoupon(rawCode, user, subtotal, session = null) {
  if (!rawCode) {
    return { valid: false, discount: 0 };
  }

  const code = String(rawCode).trim().toUpperCase();
  const coupon = COUPON_REGISTRY[code];

  if (!coupon) {
    return { valid: false, discount: 0, error: `Coupon code "${code}" is invalid` };
  }

  if (!coupon.isActive) {
    return { valid: false, discount: 0, error: `Coupon "${code}" is currently disabled` };
  }

  const now = new Date();
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    return { valid: false, discount: 0, error: `Coupon "${code}" has expired` };
  }

  if (subtotal < coupon.minOrderValue) {
    return {
      valid: false,
      discount: 0,
      error: `Coupon "${code}" requires a minimum order value of ₹${coupon.minOrderValue}`
    };
  }

  // Check usage history in MongoDB (sole source of truth)
  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  let totalUsages = 0;
  let userUsages = 0;

  if (isMongo) {
    const qTotal = CouponUsage.countDocuments({ code });
    if (session) qTotal.session(session);
    totalUsages = await qTotal;

    if (coupon.maxPerUser && user && user.id) {
      const qUser = CouponUsage.countDocuments({ code, userId: user.id });
      if (session) qUser.session(session);
      userUsages = await qUser;
    }
  } else {
    const allUsages = db.get('couponUsages') || [];
    totalUsages = allUsages.filter(u => u.code === code).length;
    if (coupon.maxPerUser && user && user.id) {
      userUsages = allUsages.filter(u => u.code === code && (u.userId === user.id || (user.phone && u.phone === user.phone))).length;
    }
  }

  if (coupon.maxTotalUsage && totalUsages >= coupon.maxTotalUsage) {
    return { valid: false, discount: 0, error: `Coupon "${code}" has reached its total redemption limit` };
  }

  if (coupon.maxPerUser) {
    if (!user || !user.id || user.id.startsWith('guest_')) {
      return {
        valid: false,
        discount: 0,
        error: `Please sign in to apply coupon "${code}"`
      };
    }
    if (userUsages >= coupon.maxPerUser) {
      return {
        valid: false,
        discount: 0,
        error: `You have already used coupon "${code}" the maximum number of times (${coupon.maxPerUser})`
      };
    }
  }

  let discount = 0;
  if (coupon.type === 'flat') {
    discount = Math.min(coupon.discount, subtotal);
  } else if (coupon.type === 'percentage') {
    const calculated = Math.round((subtotal * coupon.discountPercent) / 100);
    discount = Math.min(calculated, coupon.maxDiscount, subtotal);
  }

  return {
    valid: true,
    discount,
    coupon: {
      code: coupon.code,
      description: coupon.description,
      discount
    }
  };
}

/**
 * Records coupon usage upon confirmed payment or COD placement.
 */
export async function recordCouponUsage(rawCode, user, orderId, session = null) {
  if (!rawCode || !user || !user.id) return null;
  const code = String(rawCode).trim().toUpperCase();
  const coupon = COUPON_REGISTRY[code];
  const discount = coupon ? (coupon.type === 'flat' ? coupon.discount : 0) : 0;
  const usage = {
    id: `cp_${uuidv4()}`,
    code,
    userId: user.id,
    phone: user.phone || null,
    orderId: String(orderId),
    discount,
    redeemedAt: new Date().toISOString()
  };

  const isMongo = mongoose.connection && mongoose.connection.readyState === 1;
  if (isMongo) {
    return await CouponUsage.create([usage], { session });
  } else {
    db.insert('couponUsages', usage);
    return usage;
  }
}
