import React, { useRef } from 'react';
import { CheckCircle2, Clock, PackageCheck, ArrowRight, X, ShieldCheck, MapPin, RotateCcw, ShoppingBag } from 'lucide-react';
import type { Order, Product } from '../types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';

interface OrderConfirmationModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onViewLiveTelemetry: () => void;
  onNavigateToReturns?: () => void;
  onOpenCart?: () => void;
}

export const OrderConfirmationModal: React.FC<OrderConfirmationModalProps> = ({
  order,
  isOpen,
  onClose,
  onViewLiveTelemetry,
  onNavigateToReturns,
  onOpenCart
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  useFocusTrap(isOpen, modalRef, onClose);
  const { addItem } = useCart();
  const { showToast } = useToast();

  if (!isOpen || !order) return null;

  const estimatedDeliveryTime = order.deliverySlot 
    ? order.deliverySlot 
    : 'Express Cold-Chain Delivery';

  const handleReorder = () => {
    if (!order.items || order.items.length === 0) return;

    order.items.forEach(item => {
      const product: Product = {
        id: item.productId,
        name: item.name,
        price: item.price,
        category: 'Fresh Cuts',
        description: '',
        unit: item.unit || '500g',
        netWeight: item.netWeight || '500g',
        chillingMethod: item.chillingMethod || 'Fresh Chilled',
        cutStyle: item.cutStyle || 'Standard Curry Cut',
        stock: 99,
        imageUrl: item.imageUrl || item.image || '/images/products/chicken-curry.webp'
      };
      addItem(product, item.quantity, item.cutStyle, item.netWeight, item.price, item.price);
    });

    showToast(`Added ${order.items.length} item(s) to your cart for reorder! 🛒`, 'success');
    onClose();
    if (onOpenCart) {
      onOpenCart();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Pop-up background */}
      <div 
        onClick={onClose} 
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity animate-fade-in" 
      />

      {/* Centered pop-up card */}
      <div 
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-confirmation-title"
        tabIndex={-1}
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 text-gray-900 dark:text-gray-100 z-10 animate-scale-up focus:outline-none max-h-[92vh] overflow-y-auto"
      >
        
        {/* Close X button */}
        <button
          onClick={onClose}
          type="button"
          aria-label="Close Order Confirmed Pop-up"
          className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-full bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center justify-center text-gray-400 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition cursor-pointer focus-visible:ring-2 focus-visible:ring-[#d11243]"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Celebratory Checkmark Icon */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/70 border-4 border-emerald-50 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto shadow-sm animate-bounce">
            <CheckCircle2 className="w-9 h-9" />
          </div>

          <div>
            <h2 id="order-confirmation-title" className="text-2xl sm:text-3xl font-black text-gray-950 dark:text-white tracking-tight">
              Order Confirmed!
            </h2>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-1">
              Your fresh meat is being prepared with chilled packaging.
            </p>
          </div>
        </div>

        {/* Order Details Highlight Card */}
        <div className="mt-6 p-4 sm:p-5 rounded-2xl bg-gray-50 dark:bg-slate-800/70 border border-gray-200 dark:border-slate-700 space-y-3 shadow-xs">
          {/* Order ID */}
          <div className="flex items-center justify-between py-1 border-b border-gray-200 dark:border-slate-700">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <PackageCheck className="w-4 h-4 text-gray-700 dark:text-gray-300 shrink-0" />
              <span>Order ID</span>
            </span>
            <span className="font-mono text-sm sm:text-base font-extrabold text-gray-950 dark:text-white bg-white dark:bg-slate-900 px-2.5 py-0.5 rounded-lg border border-gray-200 dark:border-slate-700">
              #{order.id}
            </span>
          </div>

          {/* Estimated Delivery Time */}
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Estimated Delivery</span>
            </span>
            <span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400 text-right">
              {estimatedDeliveryTime}
            </span>
          </div>

          {/* Ordered Items Summary */}
          {order.items && order.items.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-slate-700 space-y-1.5">
              <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider block">
                Items ({order.items.length})
              </span>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                    <span className="text-gray-800 dark:text-gray-200 truncate font-medium">
                      {item.name} {item.netWeight ? `(${item.netWeight})` : ''} × {item.quantity}
                    </span>
                    <span className="font-bold text-gray-900 dark:text-white shrink-0">
                      ₹{item.price * item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cold Chain Packaging & Address */}
          <div className="pt-2 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Packed fresh with cold packs</span>
            </span>
            {order.deliveryAddress && (
              <span className="truncate max-w-[180px] sm:max-w-[220px] text-right font-medium text-gray-700 dark:text-gray-300">
                {order.deliveryAddress}
              </span>
            )}
          </div>
        </div>

        {/* Action Buttons: Reorder, Track, Continue Shopping */}
        <div className="mt-6 space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Button 1: Track Order */}
            <button
              type="button"
              onClick={onViewLiveTelemetry}
              className="w-full py-3 px-4 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm hover:opacity-90 active:scale-98 transition min-h-[44px]"
            >
              <span>Track Order</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Button 2: Reorder Items */}
            <button
              type="button"
              onClick={handleReorder}
              className="w-full py-3 px-4 rounded-xl bg-[#d11243] hover:bg-[#b80f3b] text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md hover:shadow-lg active:scale-98 transition min-h-[44px]"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reorder Items</span>
            </button>
          </div>

          {/* Button 3: Continue Shopping */}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 px-4 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 font-bold text-xs sm:text-sm flex items-center justify-center cursor-pointer active:scale-98 transition min-h-[44px]"
          >
            <span>Continue Shopping</span>
          </button>
        </div>

      </div>
    </div>
  );
};
