import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, Plus, Minus, ArrowRight, ShieldCheck, Zap, Tag, CheckCircle2, Info, ChevronDown, ChevronUp, Truck, Sparkles, Clock } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { QuantityStepper } from './QuantityStepper';
import { api, type DeliverySlotsResponse } from '../api';

interface CartDrawerProps {
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ onCheckout }) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const { 
    items, 
    removeItem, 
    updateQuantity, 
    clearCart, 
    isCartOpen, 
    setIsCartOpen, 
    subtotal, 
    coolerDeposit, 
    shippingFee, 
    couponCode,
    couponDiscount,
    applyCoupon,
    removeCoupon,
    activeCoupons,
    total 
  } = useCart();

  useFocusTrap(isCartOpen, drawerRef, () => setIsCartOpen(false));

  const [inputCoupon, setInputCoupon] = useState('');
  const [couponFeedback, setCouponFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [slotsData, setSlotsData] = useState<DeliverySlotsResponse | null>(null);

  useEffect(() => {
    if (isCartOpen) {
      window.history.pushState({ modal: 'cart' }, '');
      api.getDeliverySlots()
        .then(setSlotsData)
        .catch(() => {});
    }
  }, [isCartOpen]);

  if (!isCartOpen) return null;

  const freeThreshold = 499;
  const diffToFree = Math.max(0, freeThreshold - subtotal);

  // Loaded dynamically from server active coupons endpoint
  const availableCoupons = (activeCoupons || []).map((c) => ({
    code: c.code,
    title: c.type === 'percentage' ? `${c.discountPercent}% OFF` : `Flat ₹${c.discount} OFF`,
    desc: c.description || (c.minOrderValue ? `On orders above ₹${c.minOrderValue}` : 'Active promotion'),
    minOrder: c.minOrderValue || 0,
    badge: c.minOrderValue ? `Min ₹${c.minOrderValue}` : 'Active Offer'
  }));

  const handleApplyCoupon = (codeToApply?: string) => {
    const code = (codeToApply || inputCoupon).trim();
    if (!code) {
      setCouponFeedback({ type: 'error', text: 'Enter a valid coupon code' });
      return;
    }
    const res = applyCoupon(code);
    if (res.success) {
      setCouponFeedback({ type: 'success', text: res.message });
      setInputCoupon('');
    } else {
      setCouponFeedback({ type: 'error', text: res.message });
    }
  };

  const handleRemoveCoupon = () => {
    removeCoupon();
    setCouponFeedback(null);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        onClick={() => setIsCartOpen(false)}
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full w-full md:w-auto flex pl-0 md:pl-10">
        <div 
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Shopping Cart"
          tabIndex={-1}
          className="w-full md:w-screen md:max-w-md bg-white dark:bg-slate-900 border-l border-gray-200 dark:border-slate-800 shadow-2xl flex flex-col text-gray-800 dark:text-gray-100 h-full focus:outline-none overflow-x-hidden"
        >
          
          {/* Header */}
          <div className="p-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 sticky top-0 z-10 shrink-0">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-gray-950 dark:text-white">My Cart</h2>
                <span className="px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 text-xs font-bold border border-neutral-200 dark:border-neutral-700">
                  {items.length} {items.length === 1 ? 'item' : 'items'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
                <Zap className="w-3.5 h-3.5 fill-emerald-600 text-emerald-600 dark:fill-emerald-400 dark:text-emerald-400" />
                <span>Express Chilled Delivery</span>
              </div>
            </div>
            <button
              onClick={() => setIsCartOpen(false)}
              className="min-h-[44px] min-w-[44px] rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition cursor-pointer focus-visible:ring-2 focus-visible:ring-neutral-400"
              aria-label="Close cart"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Real-Time Free Delivery Progress Bar */}
          <div className="px-4 py-3 bg-neutral-50 dark:bg-neutral-900 border-b border-neutral-200 dark:border-neutral-800 text-xs shrink-0">
            {diffToFree > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-800 dark:text-neutral-200 font-bold flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400 shrink-0" />
                    <span>Add items worth <strong className="text-neutral-950 dark:text-white font-black">₹{diffToFree}</strong> more to get <strong>FREE Delivery!</strong></span>
                  </span>
                  <span className="text-xs font-black text-neutral-500 dark:text-neutral-400">
                    {Math.min(100, Math.round((subtotal / freeThreshold) * 100))}%
                  </span>
                </div>
                <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden p-0.5">
                  <div 
                    className="h-full bg-neutral-900 dark:bg-neutral-100 rounded-full transition-all duration-500 shadow-2xs"
                    style={{ width: `${Math.min(100, Math.round((subtotal / freeThreshold) * 100))}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-emerald-800 dark:text-emerald-300 font-black flex items-center gap-1.5 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>You unlocked FREE Delivery! (Saved ₹40)</span>
                </p>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold border border-emerald-300 dark:border-emerald-700 shrink-0">
                  FREE
                </span>
              </div>
            )}
          </div>

          {/* Fully Scrollable Cart Body (Items + Cold Box Card + Coupons + Bill Breakdown) */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-400 dark:text-gray-500 text-xs">
                <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-600 dark:text-neutral-300 mb-3">
                  <Zap className="w-8 h-8" />
                </div>
                <p className="font-bold text-gray-900 dark:text-white text-sm">Your Cart is Empty</p>
                <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-xs">Add fresh chicken, mutton, or fish to get started.</p>
                <button
                  onClick={() => setIsCartOpen(false)}
                  className="mt-5 px-5 py-2.5 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-extrabold shadow-sm transition cursor-pointer"
                >
                  Start shopping
                </button>
              </div>
            ) : (
              <>
                {/* Items List */}
                <div className="space-y-3">
                  {items.map((item) => {
                    const itemKey = item.id || `${item.product.id}_${item.selectedWeight || '500g'}`;
                    const itemPrice = typeof item.unitPrice === 'number' && item.unitPrice > 0 ? item.unitPrice : item.product.price;
                    const itemMrp = typeof item.unitMrp === 'number' && item.unitMrp > 0 ? item.unitMrp : item.product.mrp;
                    const savings = itemMrp && itemMrp > itemPrice ? (itemMrp - itemPrice) * item.quantity : 0;
                    const packWeight = item.selectedWeight || item.product.netWeight || item.product.unit || '500g';

                    return (
                      <div 
                        key={itemKey}
                        className="p-3 bg-white dark:bg-slate-800/90 border border-gray-200 dark:border-slate-700 rounded-xl flex gap-3 items-center shadow-2xs hover:border-gray-300 dark:hover:border-slate-600 transition"
                      >
                        <img 
                          src={item.product.image || item.product.imageUrl || `/images/products/${item.product.id}.webp`} 
                          alt={item.product.name}
                          className="w-16 h-16 rounded-xl object-cover border border-gray-100 dark:border-slate-700 shrink-0" 
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `/images/products/${item.product.id}.webp`;
                          }}
                        />

                        <div className="flex-1 min-w-0 space-y-1">
                          <h4 className="text-xs font-extrabold text-gray-950 dark:text-white truncate leading-snug">{item.product.name}</h4>
                          <div className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                            <span className="font-bold text-neutral-900 dark:text-neutral-100">₹{itemPrice}</span>
                            <span className="px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 font-bold text-xs border border-neutral-200 dark:border-neutral-700">
                              {packWeight}
                            </span>
                            {itemMrp && itemMrp > itemPrice && (
                              <span className="text-xs text-neutral-600 dark:text-neutral-400 line-through">₹{itemMrp}</span>
                            )}
                          </div>
                          {item.selectedCutStyle && (
                            <div className="inline-block px-2 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 text-xs font-semibold">
                              Cut: {item.selectedCutStyle}
                            </div>
                          )}
                          {savings > 0 && (
                            <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                              Discount: ₹{savings}
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <span className="text-xs font-black text-gray-950 dark:text-white">
                            ₹{itemPrice * item.quantity}
                          </span>

                          <QuantityStepper
                            quantity={item.quantity}
                            onIncrement={() => updateQuantity(item.id || item.product.id, item.quantity + 1)}
                            onDecrement={() => updateQuantity(item.id || item.product.id, item.quantity - 1)}
                            itemName={item.product.name}
                            showTrashOnOne={true}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 1-Click Server Coupons */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-extrabold text-xs text-gray-900 dark:text-white">
                      <Tag className="w-3.5 h-3.5 text-neutral-600 dark:text-neutral-400" />
                      <span>Offers & Coupons</span>
                    </div>
                    {couponCode && (
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:underline cursor-pointer"
                      >
                        Remove ({couponCode})
                      </button>
                    )}
                  </div>

                  {/* Server Coupons List */}
                  {availableCoupons.length > 0 && (
                    <div className="space-y-2">
                      {availableCoupons.map((c) => {
                        const isApplied = couponCode === c.code;
                        return (
                          <div
                            key={c.code}
                            className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2.5 ${
                              isApplied
                                ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700/80 shadow-2xs'
                                : 'bg-gray-50/80 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 hover:border-gray-300 dark:hover:border-slate-600'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-xs text-gray-950 dark:text-white font-mono tracking-wide">
                                  {c.code}
                                </span>
                                <span className="px-1.5 py-0.5 rounded-full bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 font-bold text-xs border border-neutral-200 dark:border-neutral-700">
                                  {c.title}
                                </span>
                              </div>
                              <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5 truncate">
                                {c.desc}
                              </p>
                            </div>

                            {isApplied ? (
                              <div className="flex items-center gap-1 text-xs font-black text-emerald-700 dark:text-emerald-400 shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Applied</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleApplyCoupon(c.code)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase cursor-pointer transition shrink-0 bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 border border-neutral-300 dark:border-neutral-700 active:scale-95"
                              >
                                Apply
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Manual Code Input Option */}
                  <div className="pt-1">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Tag className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
                        <input
                          type="text"
                          value={inputCoupon}
                          onChange={(e) => setInputCoupon(e.target.value)}
                          placeholder="Or enter coupon code"
                          className="w-full pl-8 pr-3 py-2 text-xs bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-500 uppercase font-bold text-gray-900 dark:text-white"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplyCoupon()}
                        className="px-3.5 py-2 bg-neutral-900 hover:bg-black dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 text-xs font-bold rounded-lg cursor-pointer transition shrink-0"
                      >
                        Apply
                      </button>
                    </div>

                    {couponFeedback && (
                      <p className={`text-xs mt-1 font-semibold ${
                        couponFeedback.type === 'success' ? 'text-emerald-700 dark:text-emerald-400' : 'text-neutral-700 dark:text-neutral-300'
                      }`}>
                        {couponFeedback.text}
                      </p>
                    )}
                  </div>
                </div>

                {/* Delivery Slot Display (Real Asia/Kolkata Endpoint) */}
                <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-800/80 border border-neutral-200 dark:border-neutral-700 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <div>
                      <div className="font-bold text-neutral-900 dark:text-white">
                        Express Chilled Delivery
                      </div>
                      <div className="text-neutral-500 dark:text-neutral-400">
                        {slotsData ? (
                          slotsData.hasTodaySlots
                            ? 'Today • Live courier dispatch'
                            : 'Tomorrow • Next available courier dispatch'
                        ) : (
                          'Today • Live courier dispatch'
                        )}
                      </div>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-xs shrink-0">
                    Cold Chain
                  </span>
                </div>

                {/* Detailed Bill Breakdown */}
                <div className="space-y-1.5 text-xs border-t border-gray-100 dark:border-slate-800 pt-3">
                  <div className="font-extrabold text-xs text-gray-900 dark:text-white mb-1">
                    Bill Details
                  </div>
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>Item Total:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">₹{subtotal}</span>
                  </div>
                  
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-bold">
                      <span>Coupon Discount ({couponCode}):</span>
                      <span>-₹{couponDiscount}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-600 dark:text-gray-300">
                    <span>Delivery Fee:</span>
                    <span>{shippingFee === 0 ? <strong className="text-emerald-700 dark:text-emerald-400">FREE</strong> : `₹${shippingFee}`}</span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Sticky Checkout Bottom Bar (ALWAYS visible and clickable on any screen height) */}
          {items.length > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2.5 shadow-[0_-4px_25px_rgba(0,0,0,0.08)] shrink-0 z-20">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold block">To Pay</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-black text-gray-950 dark:text-white">₹{total}</span>
                    
                  </div>
                </div>

                <button
                  onClick={() => {
                    setIsCartOpen(false);
                    onCheckout();
                  }}
                  className="py-3 px-6 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white font-bold text-sm min-h-[44px] flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg transition active:scale-[0.98]"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-neutral-500 pt-0.5 border-t border-neutral-100 dark:border-neutral-800">
                <div className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Chilled Safe Delivery</span>
                </div>
                <button
                  onClick={clearCart}
                  className="hover:text-neutral-900 dark:hover:text-white cursor-pointer text-neutral-500 font-semibold text-xs"
                >
                  Clear Cart
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
