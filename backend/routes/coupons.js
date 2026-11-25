import express from 'express';
import { COUPON_REGISTRY } from '../services/couponService.js';

const router = express.Router();

/**
 * GET /api/coupons/active
 * Returns all currently active coupons from the server registry.
 * Strictly public, read-only endpoint so client UI never hardcodes promo codes.
 */
router.get('/active', (_req, res) => {
  const now = new Date();
  const activeCoupons = Object.values(COUPON_REGISTRY)
    .filter(c => c.isActive && (!c.validUntil || new Date(c.validUntil) > now))
    .map(c => ({
      code: c.code,
      description: c.description,
      type: c.type,
      discount: c.discount || 0,
      discountPercent: c.discountPercent || 0,
      minOrderValue: c.minOrderValue || 0,
      maxDiscount: c.maxDiscount || c.discount || 0
    }));

  res.json(activeCoupons);
});

export default router;
