import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Product, CartItem } from '../types';
import { useSound } from './SoundContext';
import { api } from '../api';

export interface ActiveCoupon {
  code: string;
  description: string;
  type: string;
  discount: number;
  discountPercent: number;
  minOrderValue: number;
  maxDiscount: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (
    product: Product, 
    quantity?: number, 
    selectedCutStyle?: string,
    selectedWeight?: string,
    unitPrice?: number,
    unitMrp?: number
  ) => void;
  removeItem: (itemIdOrProductId: string) => void;
  updateQuantity: (itemIdOrProductId: string, quantity: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  subtotal: number;
  coolerDeposit: number;
  shippingFee: number;
  couponCode: string | null;
  couponDiscount: number;
  applyCoupon: (code: string) => { success: boolean; message: string };
  removeCoupon: () => void;
  activeCoupons: ActiveCoupon[];
  total: number;
  totalItems: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { playPopSound } = useSound();
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('brisketbox_cart') || localStorage.getItem('sagar_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [activeCoupons, setActiveCoupons] = useState<ActiveCoupon[]>([]);

  useEffect(() => {
    localStorage.setItem('brisketbox_cart', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    api.getActiveCoupons()
      .then(coupons => {
        if (Array.isArray(coupons)) {
          setActiveCoupons(coupons);
        }
      })
      .catch(() => setActiveCoupons([]));
  }, []);

  const applyCoupon = (code: string): { success: boolean; message: string } => {
    const clean = code.trim().toUpperCase();
    if (!clean) return { success: false, message: 'Please enter a coupon code' };
    
    const matched = activeCoupons.find(c => c.code.toUpperCase() === clean);
    if (!matched) {
      return { success: false, message: 'Invalid or expired coupon code' };
    }

    if (matched.minOrderValue && subtotal < matched.minOrderValue) {
      return { 
        success: false, 
        message: `Add items worth ₹${matched.minOrderValue - subtotal} more for ${matched.code} (Min order ₹${matched.minOrderValue})` 
      };
    }

    let disc = 0;
    if (matched.type === 'percentage') {
      const calc = Math.round((subtotal * (matched.discountPercent || 10)) / 100);
      disc = Math.min(calc, matched.maxDiscount || calc, subtotal);
    } else {
      disc = Math.min(matched.discount || 0, subtotal);
    }

    setCouponCode(matched.code);
    setCouponDiscount(disc);
    return { success: true, message: `Discount of ₹${disc} applied with ${matched.code}!` };
  };

  const removeCoupon = () => {
    setCouponCode(null);
    setCouponDiscount(0);
  };

  const addItem = (
    product: Product, 
    quantity = 1, 
    selectedCutStyle?: string,
    selectedWeight?: string,
    unitPrice?: number,
    unitMrp?: number
  ) => {
    // Play soft pop sound on add to cart
    playPopSound();

    const weight = selectedWeight || product.netWeight || product.unit || '500g';
    const cut = selectedCutStyle || product.cutStyle || 'Default';
    const finalPrice = typeof unitPrice === 'number' && unitPrice > 0 ? unitPrice : product.price;
    const finalMrp = typeof unitMrp === 'number' && unitMrp > 0 ? unitMrp : (product.mrp || Math.round(finalPrice * 1.25));
    const itemId = `${product.id}_${weight}_${cut}`.replace(/\s+/g, '_');

    setItems(prev => {
      const existing = prev.find(item => 
        (item.id && item.id === itemId) || 
        (!item.id && item.product.id === product.id && (item.selectedWeight || '500g') === weight)
      );
      if (existing) {
        return prev.map(item =>
          ((item.id && item.id === itemId) || (!item.id && item.product.id === product.id && (item.selectedWeight || '500g') === weight))
            ? { ...item, quantity: item.quantity + quantity, unitPrice: finalPrice, unitMrp: finalMrp, selectedWeight: weight, selectedCutStyle: cut }
            : item
        );
      }
      return [
        ...prev, 
        { 
          id: itemId,
          product, 
          quantity, 
          selectedCutStyle: cut,
          selectedWeight: weight,
          unitPrice: finalPrice,
          unitMrp: finalMrp
        }
      ];
    });
    setIsCartOpen(true);
  };

  const removeItem = (itemIdOrProductId: string) => {
    setItems(prev => prev.filter(item => item.id !== itemIdOrProductId && item.product.id !== itemIdOrProductId));
  };

  const updateQuantity = (itemIdOrProductId: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(itemIdOrProductId);
      return;
    }
    setItems(prev =>
      prev.map(item =>
        (item.id === itemIdOrProductId || item.product.id === itemIdOrProductId) ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    setCouponCode(null);
    setCouponDiscount(0);
  };

  const subtotal = items.reduce((sum, item) => {
    const price = typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : item.product.price;
    return sum + price * item.quantity;
  }, 0);
  
  // No cooler box deposit
  const coolerDeposit = 0;
  // Free delivery threshold: ₹499 (Swiggy style)
  const shippingFee = items.length === 0 ? 0 : (subtotal >= 499 ? 0 : 40);
  const effectiveDiscount = Math.min(couponDiscount, subtotal);
  const total = Math.max(0, subtotal - effectiveDiscount + coolerDeposit + shippingFee);
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        subtotal,
        coolerDeposit,
        shippingFee,
        couponCode,
        couponDiscount: effectiveDiscount,
        applyCoupon,
        removeCoupon,
        activeCoupons,
        total,
        totalItems
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
