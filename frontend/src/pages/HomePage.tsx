import React, { useState, useEffect } from 'react';
import { Plus, Minus, ArrowRight } from 'lucide-react';
import type { Product } from '../types';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useSound } from '../context/SoundContext';
import { HeroSection } from '../components/HeroSection';
import { CategorySection } from '../components/CategorySection';
import { DEFAULT_HONEST_PRODUCTS } from '../data/honestProducts';

interface HomePageProps {
  onNavigateToCatalog: (category?: string) => void;
  onNavigateToProduct: (productId: string) => void;
  onNavigateToReturns: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({
  onNavigateToCatalog,
  onNavigateToProduct,
  onNavigateToReturns
}) => {
  const [products, setProducts] = useState<Product[]>(DEFAULT_HONEST_PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  const [mobileDishView, setMobileDishView] = useState<Record<string, boolean>>({});
  const { items, addItem, updateQuantity } = useCart();
  const { playPopSound } = useSound();

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  useEffect(() => {
    api.getProducts()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setProducts(data);
        }
      })
      .catch(() => {});
  }, []);

  const filteredProducts = selectedCategory === 'All'
    ? products
    : products.filter(p => p.category?.toLowerCase() === selectedCategory.toLowerCase());

  const toggleDishView = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileDishView(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  return (
    <div className="space-y-6 sm:space-y-8 pb-12">
      {/* 1. HERO SECTION (Shorter on mobile, lighter bg on mobile, dark on desktop) */}
      <HeroSection 
        onExploreCuts={() => onNavigateToCatalog()}
        onNavigateToReturns={onNavigateToReturns}
      />

      {/* 2. CATEGORIES SECTION */}
      <section aria-label="Browse Categories">
        <CategorySection 
          selectedCategory={selectedCategory}
          onSelectCategory={(cat) => setSelectedCategory(cat)}
        />
      </section>

      {/* 3. SINGLE PRODUCT GRID (Rule 3: One hero, categories, one product grid, footer. No duplicated rows) */}
      <section aria-label="Fresh Cuts Product Grid" className="space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-neutral-900 dark:text-white tracking-tight">
              {selectedCategory === 'All' ? 'Fresh Cuts Daily' : `${selectedCategory} Cuts`}
            </h2>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5">
              Cleaned, dressed, and sealed in cold-chain packaging
            </p>
          </div>

          <button
            onClick={() => onNavigateToCatalog(selectedCategory !== 'All' ? selectedCategory : undefined)}
            className="text-xs font-bold text-neutral-700 dark:text-neutral-300 hover:text-neutral-950 dark:hover:text-white flex items-center gap-1 cursor-pointer min-h-[44px] min-w-[44px] px-2 py-1"
          >
            <span>View All</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Product Cards Grid */}
        <div 
          data-testid="homepage-product-grid" 
          className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
        >
          {filteredProducts.map((product) => {
            const inCartItem = items.find(i => i.product.id === product.id);
            const inCartQty = inCartItem?.quantity || 0;
            const isDishActive = mobileDishView[product.id] || false;
            const imgSrc = product.image || product.imageUrl || `/images/products/${product.id}.webp`;
            const savings = product.mrp && product.mrp > product.price ? product.mrp - product.price : 0;
            const savingsPercent = product.mrp && product.mrp > product.price
              ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
              : 0;

            return (
              <article
                key={product.id}
                data-testid={`product-card-${product.id}`}
                onClick={() => onNavigateToProduct(product.id)}
                className="group bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                {/* Image Platter */}
                <div className="relative aspect-4/3 overflow-hidden bg-neutral-100 dark:bg-neutral-800">
                  <img
                    src={imgSrc}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `/images/products/${product.id}.webp`;
                    }}
                  />

                  {/* Neutral Badges (Rule 9: No blue, purple, amber, teal, pink) */}
                  <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
                    <span className="badge-neutral text-xs px-2 py-0.5 rounded-full bg-neutral-900/80 backdrop-blur-md text-white border border-neutral-700 font-semibold">
                      {product.category || 'Fresh Cut'}
                    </span>
                  </div>

                  {/* Dish toggle (Rule 6: "Tap to see dish" on touch devices) */}
                  <button
                    type="button"
                    onClick={(e) => toggleDishView(product.id, e)}
                    className="absolute bottom-2 right-2 px-3 py-2 rounded-lg bg-neutral-900/80 backdrop-blur-md text-white text-xs font-semibold border border-neutral-700 hover:bg-neutral-800 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    {isDishActive ? 'Raw Cut' : (isTouchDevice ? 'Tap to see dish' : 'Hover to view dish')}
                  </button>
                </div>

                {/* Content */}
                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-white leading-snug line-clamp-1 group-hover:underline">
                      {product.name}
                    </h3>

                    {/* Weight & Net Specs */}
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {product.netWeight ? `Net: ${product.netWeight}` : product.unit || '500g'} • {product.cutStyle || 'Fresh Cut'}
                    </p>
                  </div>

                  {/* Pricing Matrix & Buy Button (Rule 8: Primary red is used ONLY for buy actions) */}
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        {/* Minimum 14px for price (Rule 13) */}
                        <span className="text-base sm:text-lg font-black text-neutral-900 dark:text-white">
                          ₹{product.price}
                        </span>
                        {product.mrp && product.mrp > product.price && (
                          <span className="text-xs text-neutral-600 dark:text-neutral-400 line-through">
                            ₹{product.mrp}
                          </span>
                        )}
                      </div>

                      {/* Discounts: success green or neutral, never red (Rule 10) */}
                      {savings > 0 && (
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                          {savingsPercent}% OFF
                        </span>
                      )}
                    </div>

                    {/* Buy Action: Primary Red (Rule 8) */}
                    <div>
                      {inCartQty > 0 ? (
                        <div 
                          className="flex items-center border border-neutral-300 dark:border-neutral-700 rounded-xl bg-neutral-50 dark:bg-neutral-800 p-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => updateQuantity(inCartItem!.id || product.id, inCartQty - 1)}
                            className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700"
                            aria-label={`Decrease ${product.name} quantity`}
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-2 text-sm font-black text-neutral-900 dark:text-white">
                            {inCartQty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(inCartItem!.id || product.id, inCartQty + 1)}
                            className="w-11 h-11 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:text-black dark:hover:text-white cursor-pointer rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700"
                            aria-label={`Increase ${product.name} quantity`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            playPopSound();
                            addItem(product, 1, product.cutStyle, product.unit, product.price, product.mrp);
                          }}
                          className="btn-buy-primary min-h-[44px] min-w-[44px] px-4 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer active:scale-95"
                          aria-label={`Add ${product.name} to cart`}
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                          <span>Add</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};
