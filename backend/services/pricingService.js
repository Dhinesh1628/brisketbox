import mongoose from 'mongoose';
import { db } from '../db.js';
import { Product } from '../models/Product.js';
import { validateAndApplyCoupon } from './couponService.js';

/**
 * Single tested canonical function to calculate unit price based on pack size or weight.
 *
 * @param {object} product - Product record from database
 * @param {string} selectedWeight - e.g. '500g', '800g', '1kg', '12 Eggs'
 * @returns {number} Unit price in INR
 */
export function calculateItemUnitPrice(product, selectedWeight) {
  if (!product || typeof product.price !== 'number' || product.price <= 0) {
    throw new Error(`Invalid base price for product ${product?.id || 'unknown'}`);
  }

  const weight = String(selectedWeight || product.netWeight || product.unit || '500g').toLowerCase();
  const isEgg = (product.unit || '').toLowerCase().includes('egg') || (product.category || '').toLowerCase() === 'eggs';

  if (isEgg) {
    if (weight.includes('12')) return Math.round(product.price * 1.9);
    if (weight.includes('30')) return Math.round(product.price * 4.4);
    return product.price; // default pack (e.g. 6 eggs)
  }

  if (weight.includes('800')) return Math.round(product.price * 1.52);
  if (weight.includes('1kg') || weight.includes('1000')) return Math.round(product.price * 1.85);

  return product.price; // standard base cut (typically 500g)
}

/**
 * Validates cart items and calculates complete server-side pricing.
 * Rejects any client-submitted prices, discounts, or invalid quantities.
 *
 * @param {object} params
 * @param {Array} params.items - Raw cart items from client: [{ productId, quantity, selectedWeight, selectedCutStyle }]
 * @param {string} [params.couponCode] - Coupon code to evaluate
 * @param {object} [params.user] - Authenticated user or guest
 * @param {boolean} [params.useWallet] - Whether user opted to use wallet balance
 * @param {number} [params.tipAmount] - Delivery tip in INR
 * @returns {object} Verified calculation breakdown
 */
export async function calculateOrderPricing({
  items,
  couponCode = null,
  user = null,
  useWallet = false,
  tipAmount = 0
}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Please add at least one cut to your cold box');
  }

  const isMongo = Boolean(mongoose.connection && mongoose.connection.readyState === 1);
  let subtotal = 0;
  const processedItems = [];

  for (const item of items) {
    const productId = item.productId || item.id;
    if (!productId) {
      throw new Error('Each order item must specify a valid productId');
    }

    let prod = null;
    if (isMongo) {
      prod = await Product.findOne({ id: productId }).lean();
    }
    if (!prod) {
      prod = db.findById('products', productId);
    }
    if (!prod) {
      throw new Error(`Cut "${productId}" was not found in active inventory`);
    }

    // Require quantities to be positive integers within sensible limits [1, 20]
    const qty = Number(item.quantity);
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      throw new Error(`Quantity for "${prod.name}" must be an integer between 1 and 20 (received: ${item.quantity})`);
    }

    // Pack-size verified unit price from MongoDB record
    const weight = item.selectedWeight || prod.netWeight || prod.unit || '500g';
    const unitPrice = calculateItemUnitPrice(prod, weight);
    const lineTotal = unitPrice * qty;

    subtotal += lineTotal;
    processedItems.push({
      productId: prod.id,
      name: prod.name,
      price: unitPrice,
      quantity: qty,
      unit: weight,
      netWeight: weight,
      cutStyle: item.selectedCutStyle || prod.cutStyle || 'Master Butchered',
      image: prod.image || prod.imageUrl || `/images/products/${prod.id}.jpg`
    });
  }

  // 1. Coupon Discount Calculation (Server-side validation only)
  let discountAmount = 0;
  let appliedCoupon = null;
  if (couponCode) {
    const couponResult = await validateAndApplyCoupon(couponCode, user, subtotal);
    if (couponResult.valid) {
      discountAmount = couponResult.discount;
      appliedCoupon = couponResult.coupon;
    } else if (couponResult.error) {
      // Throw descriptive error so user knows why coupon cannot be applied
      throw new Error(couponResult.error);
    }
  }

  // 2. Shipping & Deposit Fees
  const COOLER_DEPOSIT = 0; // Deposit is ₹0 as verified across all portals
  const shippingFee = subtotal >= 499 ? 0 : 40;
  const tip = Math.max(0, Math.floor(Number(tipAmount) || 0));

  // 3. Gross Total before wallet deduction
  const grossTotal = Math.max(0, subtotal - discountAmount + COOLER_DEPOSIT + shippingFee + tip);

  // 4. Wallet Deduction Calculation
  let walletDeduction = 0;
  const availableWalletBalance = Math.max(0, Number(user?.walletBalance) || 0);

  if (useWallet && availableWalletBalance > 0) {
    walletDeduction = Math.min(availableWalletBalance, grossTotal);
  }

  // 5. Net Payable Amount
  const netPayable = Math.max(0, grossTotal - walletDeduction);
  const amountInPaise = Math.round(netPayable * 100);

  return {
    subtotal,
    discountAmount,
    couponCode: appliedCoupon?.code || null,
    appliedCoupon,
    coolerDeposit: COOLER_DEPOSIT,
    shippingFee,
    tipAmount: tip,
    grossTotal,
    walletDeduction,
    netPayable,
    amountInPaise,
    processedItems
  };
}
