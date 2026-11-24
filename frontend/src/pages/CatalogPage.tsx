import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { 
  Eye, Plus, Minus, Zap, ShieldCheck, Heart, ArrowUpDown, Filter, 
  CheckCircle2, Star, TrendingDown, Search, X, Sparkles, RotateCcw, 
  Flame, Award, PackageCheck, Droplets, Leaf, Truck, ArrowRight,
  ThermometerSnowflake, QrCode, ShieldAlert
} from 'lucide-react';
import type { Product } from '../types';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useSound } from '../context/SoundContext';
import { HeroSection } from '../components/HeroSection';
import { CategorySection } from '../components/CategorySection';
import { getProductWeightOptions } from '../utils/weightUtils';
import { getProductVisual } from '../data/productVisuals';

// Lazy-load heavy product details modal to keep initial customer bundle minimal
const ProductDetailModal = lazy(() => import('../components/ProductDetailModal').then(m => ({ default: m.ProductDetailModal })));

const POPULAR_SEARCH_CHIPS = [
  { label: 'Curry Cut', term: 'Curry Cut' },
  { label: 'Biryani Cut', term: 'Biryani' },
  { label: 'Surmai Steaks', term: 'Surmai' },
  { label: 'Boneless Fillets', term: 'Boneless' },
  { label: 'Jumbo Prawns', term: 'Prawns' },
  { label: 'White Pomfret', term: 'Pomfret' },
  { label: 'Fish Tikka', term: 'Tikka' },
  { label: 'Feast Combo', term: 'Feast' },
];

interface CatalogPageProps {
  onNavigateToReturns: () => void;
  selectedCity: string;
  searchQuery: string;
  onSetSearchQuery?: (query: string) => void;
  selectedCategory?: string;
  onSelectCategory?: (category: string) => void;
  initialProductId?: string;
  onProductInspected?: (product: Product | null) => void;
  onProductClosed?: () => void;
}

export const CatalogPage: React.FC<CatalogPageProps> = ({ 
  onNavigateToReturns, 
  selectedCity,
  searchQuery,
  onSetSearchQuery,
  selectedCategory: propCategory,
  onSelectCategory: propOnSelectCategory,
  initialProductId,
  onProductInspected,
  onProductClosed
}) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [localCategory, setLocalCategory] = useState('All');
  const selectedCategory = propCategory ?? localCategory;
  const setSelectedCategory = propOnSelectCategory ?? setLocalCategory;
  const [inspectingProduct, setInspectingProduct] = useState<Product | null>(null);
  const [inspectingWeight, setInspectingWeight] = useState<string>('500g');
  const [selectedWeights, setSelectedWeights] = useState<Record<string, string>>({});
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc' | 'discount'>('featured');
  const [priceBudget, setPriceBudget] = useState<'all' | 'under300' | 'under500' | 'above500'>('all');
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [mobileCookedView, setMobileCookedView] = useState<Record<string, boolean>>({});
  const catalogGridRef = useRef<HTMLDivElement>(null);

  const toggleMobileCooked = (productId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setMobileCookedView(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };

  const { items, addItem, updateQuantity } = useCart();
  const { playPopSound } = useSound();

  // Load wishlist from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('brisketbox_wishlist');
      if (saved) setWishlist(JSON.parse(saved));
    } catch (e) {}
  }, []);

  const toggleWishlist = (productId: string, productName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated: string[];
    const exists = wishlist.includes(productId);
    if (exists) {
      updated = wishlist.filter(id => id !== productId);
      showToast(`Removed "${productName}" from saved items`);
    } else {
      updated = [...wishlist, productId];
      showToast(`Saved "${productName}" to saved cuts`);
    }
    setWishlist(updated);
    try {
      localStorage.setItem('brisketbox_wishlist', JSON.stringify(updated));
    } catch (e) {}
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleOpenProductDetail = (product: Product, weight?: string) => {
    window.history.pushState({ modal: 'product-detail' }, '', `/product/${product.id}`);
    setInspectingWeight(weight || selectedWeights[product.id] || '500g');
    setInspectingProduct(product);
    onProductInspected?.(product);
  };

  const handleCloseProductDetail = () => {
    setInspectingProduct(null);
    onProductClosed?.();
  };

  // Sync initial product if loaded via direct URL like /product/prod_1
  useEffect(() => {
    if (initialProductId && products.length > 0) {
      const match = products.find(p => p.id === initialProductId);
      if (match) {
        setInspectingProduct(match);
        setInspectingWeight(selectedWeights[match.id] || '500g');
        onProductInspected?.(match);
      }
    }
  }, [initialProductId, products]);

  useEffect(() => {
    const handlePopState = () => {
      if (inspectingProduct) {
        setInspectingProduct(null);
        onProductClosed?.();
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [inspectingProduct, onProductClosed]);

  const handleScrollToCatalog = () => {
    catalogGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  useEffect(() => {
    let isCurrent = true;
    const isSearching = Boolean(searchQuery && searchQuery.trim());

    // Debounce search input (250ms) to prevent network storms & race conditions
    const timer = setTimeout(async () => {
      try {
        setLoading(true);
        const categoryToFilter = isSearching ? 'All' : selectedCategory;
        const data = await api.getProducts({
          category: categoryToFilter,
          search: isSearching ? searchQuery.trim() : undefined
        });
        if (isCurrent) {
          setProducts(data);
        }
      } catch (err) {
        if (isCurrent) console.error('Failed to load cuts:', err);
      } finally {
        if (isCurrent) setLoading(false);
      }
    }, isSearching ? 250 : 0);

    return () => {
      isCurrent = false;
      clearTimeout(timer);
    };
  }, [selectedCategory, searchQuery]);

  // Filter products by price budget
  const filteredProducts = products.filter(p => {
    if (priceBudget === 'under300') return p.price < 300;
    if (priceBudget === 'under500') return p.price <= 500;
    if (priceBudget === 'above500') return p.price > 500;
    return true;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-asc') return a.price - b.price;
    if (sortBy === 'price-desc') return b.price - a.price;
    if (sortBy === 'discount') {
      const discA = a.mrp ? (a.mrp - a.price) / a.mrp : 0;
      const discB = b.mrp ? (b.mrp - b.price) / b.mrp : 0;
      return discB - discA;
    }
    return 0; // featured
  });

  // Product sections
  const bestSellerIds = ['prod_1', 'prod_4', 'prod_3', 'prod_5'];
  const trendingNowIds = ['prod_7', 'prod_6', 'prod_2', 'prod_8'];
  const customerFavouriteIds = ['prod_5', 'prod_4', 'prod_2', 'prod_1'];
  const freshPickIds = ['prod_3', 'prod_1', 'prod_6', 'prod_7'];

  const getSectionProducts = (idList: string[]) => {
    const list = idList.map(id => sortedProducts.find(p => p.id === id)).filter(Boolean) as Product[];
    if (list.length >= 3) return list;
    return sortedProducts.slice(0, 4);
  };

  const bestSellers = getSectionProducts(bestSellerIds);
  const trendingNow = getSectionProducts(trendingNowIds);
  const customerFavourites = getSectionProducts(customerFavouriteIds);
  const freshPicks = getSectionProducts(freshPickIds);

  const isFilteringOrSearching = Boolean(searchQuery.trim()) || selectedCategory !== 'All';

  // Render a Single Product Card
  const renderProductCard = (product: Product, sectionBadge?: string) => {
    const weightOptions = getProductWeightOptions(product);
    const currentWeight = selectedWeights[product.id] || weightOptions[0]?.weight || '500g';
    const currentOption = weightOptions.find(o => o.weight === currentWeight) || weightOptions[0];

    const cartItem = items.find(i => 
      (i.product.id === product.id && (i.selectedWeight || '500g') === currentOption.weight) ||
      (!i.selectedWeight && i.product.id === product.id && currentOption.weight === '500g')
    );
    const qty = cartItem ? cartItem.quantity : 0;
    const isWishlisted = wishlist.includes(product.id);
    const visual = getProductVisual(product.id, product.image || product.imageUrl);
    const isCookedActive = Boolean(mobileCookedView[product.id]);

    return (
      <div
        key={`${sectionBadge || 'prod'}-${product.id}`}
        onClick={() => handleOpenProductDetail(product, currentOption.weight)}
        className="group bg-white dark:bg-slate-900 rounded-2xl border border-gray-200/80 dark:border-slate-800/80 hover:border-[#d11243]/50 dark:hover:border-rose-500/50 shadow-2xs card-smooth flex flex-col justify-between overflow-hidden cursor-pointer"
      >
        {/* Image & Badges: Dual-Layer Raw-to-Cooked Cross-Fade */}
        <div className="relative h-52 bg-slate-950 overflow-hidden select-none">
          {/* Layer 1: Real Authentic Indian Cooked Dish */}
          <img
            src={visual.cookedImage}
            alt={`${visual.cookedDishName} cooked`}
            width={400}
            height={208}
            className="absolute inset-0 w-full h-full object-cover scale-100 group-hover:scale-105 transition-transform duration-500 ease-out"
            loading="lazy"
          />

          {/* Cooked Dish Warm Sizzle Vignette */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent pointer-events-none" />

          {/* Layer 2: Fresh Raw Cut with Smooth Cross-Fade */}
          <img
            src={product.image || visual.rawImage}
            alt={product.name}
            width={400}
            height={208}
            className={`absolute inset-0 w-full h-full object-cover transition-all duration-500 ease-in-out ${
              isCookedActive 
                ? 'opacity-0 scale-105 pointer-events-none' 
                : 'opacity-100 scale-100 group-hover:opacity-0 group-hover:scale-105'
            }`}
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).src = visual.rawImage;
            }}
          />

          {/* Raw Cold Vapor Vignette */}
          <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent pointer-events-none transition-opacity duration-500 ${
            isCookedActive ? 'opacity-0' : 'group-hover:opacity-0'
          }`} />

          {/* Interactive Raw vs Cooked Toggle Pill */}
          <div className="absolute top-2 left-2 z-20 flex items-center">
            <button
              type="button"
              onClick={(e) => toggleMobileCooked(product.id, e)}
              title="Tap to toggle Raw vs Cooked view"
              className="min-h-[44px] min-w-[44px] flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold backdrop-blur-md shadow-sm transition-all duration-200 border border-white/20 active:scale-95 cursor-pointer bg-black/65 hover:bg-black/85 text-white focus-visible:ring-2 focus-visible:ring-white"
            >
              <span className={`inline-block w-2 h-2 rounded-full transition-colors duration-200 ${
                isCookedActive ? 'bg-amber-400' : 'bg-cyan-400 group-hover:bg-amber-400'
              }`} />
              <span className="hidden group-hover:inline text-amber-300 font-semibold">
                {visual.cookedDishName}
              </span>
              <span className={`group-hover:hidden ${isCookedActive ? 'text-amber-300 font-semibold' : 'text-cyan-200'}`}>
                {isCookedActive ? visual.cookedDishName : 'Raw Cut'}
              </span>
            </button>
          </div>

          {/* Delivery time tag */}
          <div className="absolute top-2.5 right-14 z-20 bg-black/60 dark:bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-full text-[10px] font-bold text-amber-300 shadow-xs flex items-center gap-1 border border-white/10">
            <Zap className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span>Express</span>
          </div>

          {/* Save for Later Heart Button */}
          <button
            type="button"
            onClick={(e) => toggleWishlist(product.id, product.name, e)}
            className="absolute top-1.5 right-1.5 min-h-[44px] min-w-[44px] rounded-full bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs flex items-center justify-center text-gray-600 dark:text-gray-300 hover:text-[#d11243] dark:hover:text-rose-400 shadow-md transition z-20 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#d11243]"
            title={isWishlisted ? 'Remove from Saved' : 'Save for Later'}
            aria-label={isWishlisted ? 'Remove from Saved' : 'Save for Later'}
          >
            <Heart className={`w-4 h-4 ${isWishlisted ? 'fill-[#d11243] text-[#d11243]' : ''}`} />
          </button>

          {/* Net weight tag */}
          <div className="absolute bottom-2.5 left-2.5 z-20 bg-black/80 backdrop-blur-md px-2.5 py-0.5 rounded-md text-[10px] text-white font-medium flex items-center gap-1.5 border border-white/10">
            <span className="font-bold text-white">{currentOption.netWeight}</span>
            <span className="text-gray-300">• Gross {currentOption.grossWeight}</span>
          </div>

          {/* Dish View Prompt Pill */}
          <div className="absolute bottom-2.5 right-2.5 z-20 pointer-events-none">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md backdrop-blur-md transition-all duration-200 border ${
              isCookedActive 
                ? 'bg-amber-500/95 text-white border-amber-300/60 shadow-xs' 
                : 'bg-black/65 text-amber-200 border-white/15 group-hover:bg-amber-500/95 group-hover:text-white group-hover:border-amber-300/60'
            }`}>
              {isCookedActive ? 'Cooked Dish' : 'Hover to View Dish'}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-snug line-clamp-1 group-hover:text-[#d11243] dark:group-hover:text-rose-400 transition-colors">
              {product.name}
            </h3>
            {product.rating && product.reviewsCount ? (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="flex items-center gap-0.5 bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                  <Star className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600" />
                  <span>{product.rating}</span>
                </div>
                <span className="text-[10px] text-gray-400 font-medium">({product.reviewsCount})</span>
              </div>
            ) : null}
            <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-1 leading-relaxed">
              {product.description}
            </p>

            {/* Pieces & Serves dynamic for selected weight */}
            <div className="mt-2.5 flex items-center gap-2 text-[10px] text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/80 px-2 py-1 rounded-lg">
              <span>{currentOption.pieces || product.pieces || '4-6 Pieces'}</span>
              <span>•</span>
              <span>{currentOption.serves || product.serves || 'Serves 2-3'}</span>
            </div>

            {/* Choose Pack Size */}
            <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-slate-800" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1.5">
                <span className="uppercase tracking-wider">Choose Pack Size:</span>
                <span className="text-emerald-800 dark:text-emerald-300 font-extrabold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Daily Rate
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {weightOptions.map((opt) => {
                  const isSelected = opt.weight === currentOption.weight;
                  return (
                    <button
                      key={opt.weight}
                      type="button"
                      onClick={() => {
                        setSelectedWeights(prev => ({ ...prev, [product.id]: opt.weight }));
                        playPopSound();
                      }}
                      className={`py-1.5 px-1 rounded-xl text-center font-extrabold text-[11px] transition cursor-pointer border ${
                        isSelected
                          ? 'bg-rose-50 dark:bg-rose-950/70 border-[#d11243] dark:border-rose-500 text-[#d11243] dark:text-rose-400 shadow-2xs ring-1 ring-[#d11243]'
                          : 'bg-gray-50 dark:bg-slate-800/80 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="truncate">{opt.weight}</div>
                      {opt.badge && (
                        <div className="text-[8px] font-black uppercase text-amber-600 dark:text-amber-400 truncate mt-0.5">
                          {opt.badge}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Price, Market Comparison & Add to Cart */}
          <div className="pt-2 border-t border-gray-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-extrabold text-base text-gray-950 dark:text-white">₹{currentOption.price}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 line-through">₹{currentOption.mrp}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-black text-emerald-800 dark:text-emerald-300">
                  {currentOption.discountPercent}% OFF
                </span>
                <span className="text-[10px] text-gray-600 dark:text-gray-400 font-medium">
                  • Save ₹{currentOption.savings}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenProductDetail(product, currentOption.weight);
                }}
                className="min-h-[44px] min-w-[44px] p-2 rounded-xl bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-600 dark:text-gray-300 cursor-pointer transition flex items-center justify-center focus-visible:ring-2 focus-visible:ring-[#d11243]"
                title="View details"
                aria-label={`View details for ${product.name}`}
              >
                <Eye className="w-4 h-4" />
              </button>

              {qty === 0 ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    addItem(product, 1, undefined, currentOption.weight, currentOption.price, currentOption.mrp);
                    showToast(`Added ${product.name} (${currentOption.weight}) to Your Cart`);
                  }}
                  className="min-h-[44px] min-w-[80px] px-3.5 rounded-xl bg-white dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[#d11243] dark:text-rose-400 font-black text-xs uppercase cursor-pointer border-2 border-[#d11243]/80 hover:border-[#d11243] shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1 select-none focus-visible:ring-2 focus-visible:ring-[#d11243]"
                  aria-label={`Add ${product.name} to cart`}
                >
                  <span>ADD</span>
                  <span className="text-sm font-black leading-none">+</span>
                </button>
              ) : (
                <div className="min-h-[44px] min-w-[88px] flex items-center justify-between border-2 border-[#d11243] rounded-xl bg-white dark:bg-slate-900 shadow-xs overflow-hidden select-none">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(cartItem?.id || product.id, qty - 1);
                    }}
                    className="min-h-[44px] min-w-[36px] flex items-center justify-center text-[#d11243] dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 font-black transition cursor-pointer active:scale-90 focus-visible:ring-2 focus-visible:ring-[#d11243]"
                    title="Decrease quantity"
                    aria-label={`Decrease quantity of ${product.name}`}
                  >
                    <Minus className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                  <span className="text-xs font-black text-[#d11243] dark:text-rose-400 px-1">
                    {qty}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateQuantity(cartItem?.id || product.id, qty + 1);
                    }}
                    className="min-h-[44px] min-w-[36px] flex items-center justify-center text-[#d11243] dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 font-black transition cursor-pointer active:scale-90 focus-visible:ring-2 focus-visible:ring-[#d11243]"
                    title="Increase quantity"
                    aria-label={`Increase quantity of ${product.name}`}
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

      </div>
    );
  };

  return (
    <div className="space-y-10 sm:space-y-16 pb-24 relative max-w-full overflow-x-hidden">
      
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-900/95 dark:bg-white/95 text-white dark:text-gray-900 px-4 py-2.5 rounded-2xl shadow-xl text-xs font-bold flex items-center gap-2 border border-white/20 dark:border-gray-800 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Hero Section */}
      <HeroSection 
        onExploreCuts={handleScrollToCatalog}
        onNavigateToReturns={onNavigateToReturns}
      />

      {/* Explore Categories Section */}
      <div id="catalog-grid-top" ref={catalogGridRef} className="scroll-mt-28 sm:scroll-mt-32 space-y-4 sm:space-y-6">
        <CategorySection
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          onViewAllSpecs={handleScrollToCatalog}
        />

        {/* Chilled Packaging Assurance Strip */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-3 sm:p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 transition-colors">
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-rose-50 dark:bg-rose-950/70 border border-rose-100 dark:border-rose-900 flex items-center justify-center text-[#d11243] dark:text-rose-400 font-black text-xs sm:text-sm shrink-0 shadow-xs">
              <ThermometerSnowflake className="w-5 h-5 text-[#d11243] dark:text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xs sm:text-sm text-gray-950 dark:text-white">
                  Fresh Chilled Packaging
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 text-[9px] sm:text-[10px] font-black border border-emerald-200 dark:border-emerald-800">
                  Chilled
                </span>
              </div>
              <p className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                Delivered fresh in temperature-controlled packaging across {selectedCity || 'your city'}.
              </p>
            </div>
          </div>

          <button
            onClick={onNavigateToReturns}
            className="w-full md:w-auto px-3.5 py-2 rounded-xl bg-gray-950 hover:bg-black dark:bg-white dark:hover:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold cursor-pointer shrink-0 transition shadow-xs flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-emerald-400 dark:text-emerald-600" />
            <span>Eco Box Packaging</span>
          </button>
        </div>

        {/* Quick Search Trending Chips */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
          <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold text-xs shrink-0 mr-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Trending:</span>
          </div>
          {POPULAR_SEARCH_CHIPS.map((chip) => (
            <button
              key={chip.term}
              onClick={() => onSetSearchQuery?.(chip.term)}
              className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap cursor-pointer transition border ${
                searchQuery.toLowerCase() === chip.term.toLowerCase()
                  ? 'bg-rose-50 dark:bg-rose-950/80 text-[#d11243] dark:text-rose-400 border-[#d11243]'
                  : 'bg-white dark:bg-slate-900 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-slate-800 hover:border-gray-400'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {/* Active Search Filter Banner */}
        {searchQuery.trim() && (
          <div className="flex items-center justify-between bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl px-3 sm:px-4 py-2 text-xs">
            <div className="flex items-center gap-2 min-w-0 truncate">
              <Search className="w-4 h-4 text-[#d11243] shrink-0" />
              <span className="text-gray-900 dark:text-gray-100 truncate">
                Search results for <span className="font-bold text-[#d11243]">"{searchQuery}"</span>
              </span>
              <span className="text-gray-400 font-medium shrink-0">({sortedProducts.length})</span>
            </div>
            <button
              onClick={() => onSetSearchQuery?.('')}
              className="flex items-center gap-1 text-[#d11243] hover:text-[#b80f3b] font-bold cursor-pointer shrink-0 ml-2"
            >
              <X className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        )}

        {/* Sorting, Price Budget Filters & Results Count Bar */}
        <div className="bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border border-gray-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs max-w-full overflow-hidden">
          {/* Price Budget Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full">
            <span className="text-gray-400 font-bold text-[10px] sm:text-[11px] mr-1 hidden sm:inline">Price:</span>
            {[
              { id: 'all', label: 'All Prices' },
              { id: 'under300', label: 'Under ₹300' },
              { id: 'under500', label: 'Under ₹500' },
              { id: 'above500', label: '₹500+' }
            ].map(b => (
              <button
                key={b.id}
                onClick={() => setPriceBudget(b.id as any)}
                className={`px-2.5 sm:px-3 py-1 rounded-xl font-bold text-[11px] sm:text-xs cursor-pointer transition whitespace-nowrap ${
                  priceBudget === b.id
                    ? 'bg-[#d11243] text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-700'
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
            <ArrowUpDown className="w-3.5 h-3.5 text-gray-400" />
            <label htmlFor="sort-products-select" className="text-gray-500 dark:text-gray-400 font-semibold text-[10px] sm:text-[11px]">Sort By:</label>
            <select
              id="sort-products-select"
              aria-label="Sort products by"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="min-h-[44px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 rounded-xl bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-800 dark:text-gray-200 font-bold text-[11px] sm:text-xs focus:outline-none focus:border-[#d11243] cursor-pointer"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
              <option value="discount">Special Offers</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 p-3 space-y-3 animate-pulse">
              <div className="h-44 bg-gray-100 dark:bg-slate-800 rounded-xl"></div>
              <div className="h-4 bg-gray-100 dark:bg-slate-800 rounded w-3/4"></div>
              <div className="h-3 bg-gray-100 dark:bg-slate-800 rounded w-1/2"></div>
              <div className="h-8 bg-gray-100 dark:bg-slate-800 rounded w-full"></div>
            </div>
          ))}
        </div>
      ) : sortedProducts.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-800 flex flex-col items-center justify-center space-y-3 max-w-lg mx-auto">
          <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-gray-400">
            <Search className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white text-base">
            {searchQuery ? `No cuts matching "${searchQuery}"` : 'No products found'}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm">
            {searchQuery 
              ? 'Try searching with generic terms like "chicken", "biryani", "prawns", "fish", or explore our freshly inwarded cuts below.' 
              : 'Try selecting another category above or reset your filters.'}
          </p>
          <div className="pt-2 flex flex-wrap gap-2 justify-center">
            {searchQuery && (
              <button
                onClick={() => onSetSearchQuery?.('')}
                className="px-4 py-2 bg-[#d11243] hover:bg-[#b80f3b] text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Show All Fresh Cuts</span>
              </button>
            )}
            <button
              onClick={() => setSelectedCategory('All')}
              className="px-4 py-2 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              Reset Category
            </button>
          </div>
        </div>
      ) : isFilteringOrSearching ? (
        /* Filtered or Search View */
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-gray-200 dark:border-slate-800">
            <div>
              <h2 className="text-xl font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <span>{selectedCategory !== 'All' ? selectedCategory : 'Filtered Cuts'}</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/70 text-[#d11243] dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                  {sortedProducts.length} items
                </span>
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Chilled packaging • Delivered fresh across {selectedCity || 'your city'}
              </p>
            </div>
            <button
              onClick={() => {
                setSelectedCategory('All');
                onSetSearchQuery?.('');
              }}
              className="text-xs font-bold text-[#d11243] hover:underline cursor-pointer"
            >
              View All Categories
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {sortedProducts.map((product) => renderProductCard(product, 'filter'))}
          </div>
        </div>
      ) : (
        /* Category sections */
        <div className="space-y-14 sm:space-y-18">
          
          {/* SECTION 1: BEST SELLERS */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-gray-200/80 dark:border-slate-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Award className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Best sellers
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 dark:bg-rose-950/80 text-[#d11243] dark:text-rose-400 border border-rose-200 dark:border-rose-900">
                    Most Ordered
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Most ordered cuts • Delivered cold to your doorstep
                </p>
              </div>
              <button 
                onClick={handleScrollToCatalog}
                className="text-xs font-bold text-[#d11243] dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <span>Browse All</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {bestSellers.map((product) => renderProductCard(product, 'bestseller'))}
            </div>
          </section>

          {/* SECTION 2: TRENDING NOW */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-gray-200/80 dark:border-slate-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-rose-500/10 text-[#d11243] dark:text-rose-400">
                    <Flame className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Trending Now
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900">
                    Selling Fast
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  High-demand culinary marinades & fresh morning catches flying off shelves
                </p>
              </div>
              <button 
                onClick={handleScrollToCatalog}
                className="text-xs font-bold text-[#d11243] dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <span>View More</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {trendingNow.map((product) => renderProductCard(product, 'trending'))}
            </div>
          </section>

          {/* PROMOTIONAL VALUE BANNER (Between sections 2 and 3) */}
          <div className="relative rounded-3xl overflow-hidden shadow-md border border-rose-200/70 dark:border-rose-900/50 bg-gradient-to-r from-[#b00f37] via-[#d11243] to-[#800a26] text-white p-5 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-5 sm:gap-6">
            <div className="space-y-2 max-w-xl text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[10px] sm:text-[11px] font-black uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Weekend Culinary Feast</span>
              </div>
              <h3 className="text-xl sm:text-3xl font-black tracking-tight leading-tight">
                FLAT 20% OFF ON ORDERS ABOVE ₹799
              </h3>
              <p className="text-xs sm:text-sm text-rose-100 font-medium">
                Use code <span className="font-black text-amber-300 tracking-wider bg-black/30 px-2 py-0.5 rounded-md">BRISKET20</span> at checkout. Fresh cuts in chilled packaging.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 sm:gap-3 w-full sm:w-auto shrink-0">
              <button
                onClick={() => {
                  navigator.clipboard?.writeText('BRISKET20');
                  showToast('Coupon code "BRISKET20" copied to clipboard!');
                }}
                className="w-full sm:w-auto text-center px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-white text-[#d11243] hover:bg-rose-50 font-black text-xs uppercase tracking-wider shadow-md transition-transform active:scale-95 cursor-pointer"
              >
                Copy Code: BRISKET20
              </button>
              <button
                onClick={handleScrollToCatalog}
                className="w-full sm:w-auto text-center px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-black/40 hover:bg-black/60 text-white font-bold text-xs ring-1 ring-white/20 transition cursor-pointer"
              >
                Shop Now →
              </button>
            </div>
          </div>

          {/* SECTION 3: CUSTOMER FAVOURITES */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-gray-200/80 dark:border-slate-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
                    <Star className="w-5 h-5 fill-emerald-500" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Customer Favourites
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900">
                    Customer Loved
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Popular customer-selected cuts delivered cold to your doorstep
                </p>
              </div>
              <button 
                onClick={handleScrollToCatalog}
                className="text-xs font-bold text-[#d11243] dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <span>View Ratings</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {customerFavourites.map((product) => renderProductCard(product, 'favourite'))}
            </div>
          </section>

          {/* SECTION 4: FRESH PICKS */}
          <section className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-3 border-b border-gray-200/80 dark:border-slate-800/80">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                    Fresh Picks
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-cyan-50 dark:bg-cyan-950/80 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-900">
                    Daily Selection
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Daily fresh arrivals from trusted local partners
                </p>
              </div>
              <button 
                onClick={handleScrollToCatalog}
                className="text-xs font-bold text-[#d11243] dark:text-rose-400 hover:underline flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                <span>See Selection Details</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {freshPicks.map((product) => renderProductCard(product, 'freshpick'))}
            </div>
          </section>

        </div>
      )}

      {/* Freshness & Quality Note */}
      <section className="pt-8">
        <div className="rounded-3xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 p-6 sm:p-8 shadow-sm">
          <div className="max-w-2xl space-y-2">
            <h3 className="text-lg sm:text-xl font-black text-gray-950 dark:text-white">
              Fresh cuts, prepared daily
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              All our meat and seafood is cut and cleaned fresh every morning. Packed on ice and delivered cold to your door.
            </p>
          </div>
        </div>
      </section>

      {/* Product Detail Modal */}
      {inspectingProduct && (
        <Suspense fallback={null}>
          <ProductDetailModal
            product={inspectingProduct}
            initialWeight={inspectingWeight}
            onClose={handleCloseProductDetail}
          />
        </Suspense>
      )}

    </div>
  );
};
