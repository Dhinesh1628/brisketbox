import React, { useState, useEffect } from 'react';
import { 
  ChevronRight, Plus, Minus, Check, ArrowRight, Utensils
} from 'lucide-react';
import type { Product } from '../types';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useSound } from '../context/SoundContext';
import { DEFAULT_HONEST_PRODUCTS } from '../data/honestProducts';
import { getProductWeightOptions } from '../utils/weightUtils';
import { getProductVisual } from '../data/productVisuals';

interface ProductDetailPageProps {
  productId: string;
  onNavigateHome: () => void;
  onNavigateCatalog: () => void;
  onOpenCart: () => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  productId,
  onNavigateHome,
  onNavigateCatalog,
  onOpenCart
}) => {
  const [product, setProduct] = useState<Product | null>(() => {
    return DEFAULT_HONEST_PRODUCTS.find(p => p.id === productId) || null;
  });
  const [loading, setLoading] = useState<boolean>(!product);
  const [selectedWeight, setSelectedWeight] = useState<string>('500g');
  const [viewCooked, setViewCooked] = useState<boolean>(false);
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  const [justAdded, setJustAdded] = useState<boolean>(false);

  const { items, addItem, updateQuantity } = useCart();
  const { playPopSound } = useSound();

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    api.getProduct(productId)
      .then((p) => {
        if (p) {
          setProduct(p);
          const opts = getProductWeightOptions(p);
          if (opts.length > 0) setSelectedWeight(opts[0].weight);
        }
      })
      .catch(() => {
        const fallback = DEFAULT_HONEST_PRODUCTS.find(p => p.id === productId);
        if (fallback) setProduct(fallback);
      })
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 min-h-[400px]">
        <div className="w-8 h-8 border-3 border-neutral-900 dark:border-neutral-100 border-t-transparent rounded-full animate-spin mb-3" />
        <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">Loading cut details...</span>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-12 text-center space-y-4 my-8 max-w-lg mx-auto">
        <h2 className="text-lg font-bold text-neutral-900 dark:text-white">Cut Not Found</h2>
        <p className="text-xs text-neutral-600 dark:text-neutral-400">This fresh cut may be out of stock or seasonal.</p>
        <button
          onClick={onNavigateCatalog}
          className="btn-buy-primary px-5 py-2.5 rounded-xl text-sm font-bold cursor-pointer"
        >
          Back to Catalog
        </button>
      </div>
    );
  }

  const weightOptions = getProductWeightOptions(product);
  const activeWeightOption = weightOptions.find(o => o.weight === selectedWeight) || weightOptions[0] || {
    weight: product.unit || '500g',
    price: product.price,
    mrp: product.mrp || Math.round(product.price * 1.15),
    serves: product.serves || '2-3',
    netWeight: product.netWeight || product.unit || '450g'
  };

  const visual = getProductVisual(product.id);
  const cookedImg = visual.cookedImage || product.image;
  const rawImg = product.image || product.imageUrl || `/images/products/${product.id}.webp`;

  const inCartItem = items.find(i => i.product.id === product.id && i.selectedWeight === selectedWeight);
  const inCartQty = inCartItem?.quantity || 0;

  const currentPrice = activeWeightOption.price || product.price;
  const currentMrp = activeWeightOption.mrp || product.mrp || Math.round(currentPrice * 1.15);
  const savings = currentMrp > currentPrice ? currentMrp - currentPrice : 0;
  const savingsPercent = currentMrp > currentPrice ? Math.round(((currentMrp - currentPrice) / currentMrp) * 100) : 0;

  const handleAdd = () => {
    playPopSound();
    addItem(
      product,
      1,
      product.cutStyle,
      activeWeightOption.weight,
      currentPrice,
      currentMrp
    );
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  return (
    <div className="space-y-6 pb-20 max-w-6xl mx-auto" data-testid="product-detail-page">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
        <button onClick={onNavigateHome} className="hover:text-neutral-950 dark:hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center px-2">
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <button onClick={onNavigateCatalog} className="hover:text-neutral-950 dark:hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center px-2">
          Catalog
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-bold text-neutral-900 dark:text-white truncate max-w-[200px] sm:max-w-none">
          {product.name}
        </span>
      </nav>

      {/* Main 2-Column Product Showcase */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Visual Platter */}
        <div className="lg:col-span-6 space-y-3">
          <div className="relative aspect-4/3 sm:aspect-square rounded-2xl overflow-hidden bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800 shadow-md">
            <img
              src={viewCooked ? cookedImg : rawImg}
              alt={viewCooked ? `${product.name} cooked inspiration` : product.name}
              className="w-full h-full object-cover transition-all duration-300"
              onError={(e) => {
                (e.target as HTMLImageElement).src = `/images/products/${product.id}.webp`;
              }}
            />

            {/* Badges: Neutral style (Rule 9) */}
            <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
              <span className="badge-neutral text-xs px-2.5 py-1 rounded-full bg-neutral-900/85 text-white border border-neutral-700 font-semibold backdrop-blur-md">
                {product.category || 'Fresh Cut'}
              </span>
              <span className="badge-neutral text-xs px-2.5 py-1 rounded-full bg-neutral-900/85 text-white border border-neutral-700 font-semibold backdrop-blur-md">
                Cold Chain
              </span>
            </div>

            {/* Dish toggle button (Rule 6: "Tap to see dish" on touch devices) */}
            <div className="absolute bottom-3 right-3 z-10">
              <button
                type="button"
                onClick={() => setViewCooked(!viewCooked)}
                className="px-3.5 py-2 rounded-xl bg-neutral-900/85 backdrop-blur-md text-white text-xs font-semibold border border-neutral-700 hover:bg-neutral-800 transition cursor-pointer flex items-center gap-1.5 min-h-[44px] min-w-[44px]"
              >
                <Utensils className="w-3.5 h-3.5" />
                <span>{viewCooked ? 'View Raw Cut' : (isTouchDevice ? 'Tap to see dish' : 'Hover to view dish')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Pricing, Specs & Buy Actions */}
        <div className="lg:col-span-6 space-y-6">
          <div className="space-y-2">
            <h1 className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white tracking-tight leading-tight">
              {product.name}
            </h1>
            <p className="text-xs sm:text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
              {product.description}
            </p>
          </div>

          {/* Pricing Matrix */}
          <div className="p-4 rounded-2xl bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 space-y-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black text-neutral-900 dark:text-white">
                ₹{currentPrice}
              </span>
              {currentMrp > currentPrice && (
                <span className="text-sm text-neutral-600 dark:text-neutral-400 line-through">
                  ₹{currentMrp}
                </span>
              )}
              {savings > 0 && (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                  {savingsPercent}% OFF
                </span>
              )}
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Inclusive of all taxes. Fresh delivery in temperature-safe packaging.
            </p>
          </div>

          {/* Pack Size / Weight Selection (Rule 8: Primary red selected pack size outline) */}
          {weightOptions.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 block">
                Select Pack Size / Weight
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {weightOptions.map((opt) => {
                  const isSelected = selectedWeight === opt.weight;
                  return (
                    <button
                      key={opt.weight}
                      type="button"
                      onClick={() => setSelectedWeight(opt.weight)}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                        isSelected
                          ? 'border-[#d11243] ring-1 ring-[#d11243] bg-neutral-100/60 dark:bg-neutral-800/60 shadow-2xs'
                          : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 hover:border-neutral-300'
                      }`}
                    >
                      <div className="text-xs font-bold text-neutral-900 dark:text-white">
                        {opt.weight}
                      </div>
                      <div className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
                        ₹{opt.price} • {opt.serves}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Specifications Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <span className="text-neutral-600 dark:text-neutral-400 block">Net Weight</span>
              <span className="font-bold text-neutral-900 dark:text-white">{product.netWeight || product.unit || '450g'}</span>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <span className="text-neutral-600 dark:text-neutral-400 block">Gross Weight</span>
              <span className="font-bold text-neutral-900 dark:text-white">{product.grossWeight || product.unit || '500g'}</span>
            </div>
            <div className="p-3 rounded-xl bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <span className="text-neutral-600 dark:text-neutral-400 block">Pieces / Serves</span>
              <span className="font-bold text-neutral-900 dark:text-white">{product.pieces || product.serves || 'Serves 2-3'}</span>
            </div>
          </div>

          {/* Buy Actions: Primary Red (Rule 8) */}
          <div className="pt-2 flex items-center gap-3">
            {inCartQty > 0 ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center border border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800 p-1">
                  <button
                    type="button"
                    onClick={() => updateQuantity(inCartItem!.id || product.id, inCartQty - 1)}
                    className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer rounded-lg hover:bg-neutral-200"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="px-4 text-base font-black text-neutral-900 dark:text-white">
                    {inCartQty} in Cart
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(inCartItem!.id || product.id, inCartQty + 1)}
                    className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer rounded-lg hover:bg-neutral-200"
                    aria-label="Increase quantity"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onOpenCart}
                  className="px-5 py-3 rounded-xl bg-neutral-900 hover:bg-black dark:bg-neutral-100 dark:hover:bg-white text-white dark:text-neutral-900 font-bold text-sm min-h-[44px] cursor-pointer"
                >
                  View Cart
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleAdd}
                className="btn-buy-primary flex-1 sm:flex-initial px-8 py-3.5 rounded-xl text-sm font-bold min-h-[44px] flex items-center justify-center gap-2 shadow-md cursor-pointer active:scale-95"
              >
                {justAdded ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Added to Cart</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>Add to Cart (₹{currentPrice})</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Storage & Handling Notes */}
          <div className="pt-4 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-600 dark:text-neutral-400 space-y-1">
            <p>• <strong>Storage:</strong> Keep refrigerated and cook within 2 days.</p>
            <p>• <strong>Delivery:</strong> Delivered in thermal-insulated packaging with food-grade gel ice packs.</p>
          </div>
        </div>

      </div>
    </div>
  );
};
