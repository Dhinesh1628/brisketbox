import React, { useState, useEffect } from 'react';
import { Search, Filter, Plus, ArrowUpDown, ChevronRight, X, RotateCcw } from 'lucide-react';
import type { Product } from '../types';
import { api } from '../api';
import { useCart } from '../context/CartContext';
import { useSound } from '../context/SoundContext';
import { QuantityStepper } from '../components/QuantityStepper';
import { ProductCardSkeleton } from '../components/ProductCardSkeleton';
import { searchProductsWithTypoTolerance } from '../utils/searchUtils';
import { DEFAULT_HONEST_PRODUCTS } from '../data/honestProducts';

interface CatalogPageProps {
  initialCategory?: string;
  searchQuery?: string;
  onSetSearchQuery?: (q: string) => void;
  onNavigateToProduct: (productId: string) => void;
  onNavigateHome: () => void;
  onNavigateToReturns?: () => void;
}

const CATEGORIES = ['All', 'Chicken', 'Mutton', 'Seafood', 'Combos'];
const CUT_STYLES = ['All', 'Curry Cut', 'Steaks', 'Boneless Fillet', 'Whole Cleaned', 'Assorted Cuts'];
const PRICE_FILTERS = [
  { label: 'All Prices', value: 'all' },
  { label: 'Under ₹300', value: 'under300' },
  { label: '₹300 - ₹600', value: '300to600' },
  { label: 'Above ₹600', value: 'above600' }
];

export const CatalogPage: React.FC<CatalogPageProps> = ({
  initialCategory = 'All',
  searchQuery: propSearchQuery = '',
  onSetSearchQuery,
  onNavigateToProduct,
  onNavigateHome
}) => {
  const [products, setProducts] = useState<Product[]>(DEFAULT_HONEST_PRODUCTS);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [selectedCutStyle, setSelectedCutStyle] = useState<string>('All');
  const [priceBudget, setPriceBudget] = useState<string>('all');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sortBy, setSortBy] = useState<'featured' | 'price-asc' | 'price-desc'>('featured');
  const [localSearch, setLocalSearch] = useState<string>(propSearchQuery);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const { items, addItem, updateQuantity } = useCart();
  const { playPopSound } = useSound();

  const searchQuery = onSetSearchQuery ? propSearchQuery : localSearch;
  const setSearchQuery = onSetSearchQuery || setLocalSearch;

  // Typo-tolerant search resolution (Item 9)
  const typoSearchResult = React.useMemo(() => {
    if (!searchQuery.trim()) return { products: [], suggestedTerm: null, isTypoCorrected: false };
    return searchProductsWithTypoTolerance(searchQuery, products, 100);
  }, [searchQuery, products]);

  const typoMatchedIds = React.useMemo(() => {
    return new Set(typoSearchResult.products.map(p => p.id));
  }, [typoSearchResult]);

  useEffect(() => {
    if (initialCategory) {
      setSelectedCategory(initialCategory);
    }
  }, [initialCategory]);

  useEffect(() => {
    setIsLoading(true);
    api.getProducts()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setProducts(data);
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // Filter products based on search, category, cut style, price budget, stock
  const filteredProducts = products.filter((p) => {
    // 1. Search filter with typo tolerance
    if (searchQuery.trim()) {
      if (!typoMatchedIds.has(p.id)) return false;
    }

    // 2. Category filter
    if (selectedCategory !== 'All') {
      const pCat = p.category?.toLowerCase() || '';
      const sCat = selectedCategory.toLowerCase();
      if (sCat === 'combos' && !pCat.includes('combo')) return false;
      if (sCat !== 'combos' && !pCat.includes(sCat)) return false;
    }

    // 3. Cut style filter
    if (selectedCutStyle !== 'All') {
      const pCut = p.cutStyle?.toLowerCase() || '';
      const sCut = selectedCutStyle.toLowerCase();
      if (!pCut.includes(sCut)) return false;
    }

    // 4. Price budget filter
    if (priceBudget === 'under300' && p.price >= 300) return false;
    if (priceBudget === '300to600' && (p.price < 300 || p.price > 600)) return false;
    if (priceBudget === 'above600' && p.price <= 600) return false;

    // 5. In-stock filter
    if (inStockOnly && typeof p.stock === 'number' && p.stock <= 0) return false;

    return true;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortBy === 'price-asc') return a.price - b.price;
    if (sortBy === 'price-desc') return b.price - a.price;
    return 0;
  });

  const resetFilters = () => {
    setSelectedCategory('All');
    setSelectedCutStyle('All');
    setPriceBudget('all');
    setInStockOnly(false);
    setSortBy('featured');
    setSearchQuery('');
  };

  const hasActiveFilters = selectedCategory !== 'All' || selectedCutStyle !== 'All' || priceBudget !== 'all' || inStockOnly || Boolean(searchQuery.trim());

  return (
    <div className="space-y-6 pb-16" data-testid="catalog-page">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-400">
        <button 
          onClick={onNavigateHome} 
          className="hover:text-neutral-950 dark:hover:text-white cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center px-2"
        >
          Home
        </button>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-bold text-neutral-900 dark:text-white">Catalog</span>
        {selectedCategory !== 'All' && (
          <>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="font-bold text-neutral-900 dark:text-white">{selectedCategory}</span>
          </>
        )}
      </nav>

      {/* Header & Search Bar */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-neutral-900 dark:text-white tracking-tight">
              Fresh Cuts Catalog
            </h1>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1">
              Filter by category, cut style, and price with cold-chain delivery.
            </p>
          </div>

          {/* Search Field */}
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chicken, surmai, mutton..."
              className="w-full pl-9 pr-10 py-2.5 min-h-[44px] text-xs bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-xl focus:outline-none focus:border-neutral-400 text-neutral-900 dark:text-white"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-1 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-400 hover:text-neutral-600 cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Desktop Filters Toolbar */}
        <div className="hidden md:flex flex-wrap items-center justify-between gap-3 text-xs pt-2 border-t border-neutral-100 dark:border-neutral-800">
          
          {/* Category Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[44px] min-w-[44px] px-3.5 py-2 rounded-full font-bold transition cursor-pointer flex items-center justify-center ${
                  selectedCategory === cat
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 shadow-2xs'
                    : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Controls: Price, Cut, Sort */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Price Filter */}
            <select
              value={priceBudget}
              onChange={(e) => setPriceBudget(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer focus:outline-none"
              aria-label="Filter by price"
            >
              {PRICE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>

            {/* Cut Style Filter */}
            <select
              value={selectedCutStyle}
              onChange={(e) => setSelectedCutStyle(e.target.value)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer focus:outline-none"
              aria-label="Filter by cut style"
            >
              {CUT_STYLES.map((cut) => (
                <option key={cut} value={cut}>{cut === 'All' ? 'All Cuts' : cut}</option>
              ))}
            </select>

            {/* Sort Filter */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-800 dark:text-neutral-200 cursor-pointer focus:outline-none"
              aria-label="Sort products"
            >
              <option value="featured">Featured</option>
              <option value="price-asc">Price: Low to High</option>
              <option value="price-desc">Price: High to Low</option>
            </select>

            {/* In-Stock Toggle */}
            <button
              type="button"
              role="switch"
              aria-checked={inStockOnly}
              onClick={() => setInStockOnly(!inStockOnly)}
              className={`min-h-[44px] min-w-[44px] flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold cursor-pointer select-none transition ${
                inStockOnly
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${inStockOnly ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-neutral-400'}`} />
              <span>In Stock</span>
            </button>

            {/* Reset Filters Button */}
            {hasActiveFilters && (
              <button
                onClick={resetFilters}
                className="min-h-[44px] min-w-[44px] flex items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white px-3 py-2 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Filter Trigger Bar (Item 3) */}
        <div className="flex md:hidden items-center justify-between gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
          <button
            type="button"
            onClick={() => setIsMobileFilterOpen(true)}
            data-testid="mobile-filters-trigger"
            className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-bold text-xs shadow-2xs cursor-pointer active:scale-98"
          >
            <Filter className="w-3.5 h-3.5" />
            <span>Filters & Sort</span>
            {selectedCategory !== 'All' && (
              <span className="px-2 py-0.5 rounded-full bg-neutral-700 dark:bg-neutral-300 text-white dark:text-neutral-900 text-[10px] font-black">
                {selectedCategory}
              </span>
            )}
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[44px] px-3 py-2 rounded-xl border border-neutral-200 dark:border-neutral-700 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3 h-3 inline mr-1" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Mobile Filter Bottom Sheet (Item 3) */}
      {isMobileFilterOpen && (
        <div className="md:hidden fixed inset-0 z-50 overflow-hidden" data-testid="mobile-filters-bottom-sheet">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileFilterOpen(false)}
          />

          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] bg-white dark:bg-neutral-900 rounded-t-3xl border-t border-neutral-200 dark:border-neutral-800 shadow-2xl flex flex-col text-neutral-800 dark:text-neutral-100 overflow-hidden">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between sticky top-0 bg-white dark:bg-neutral-900 z-10 shrink-0">
              <div>
                <h3 className="text-base font-black text-neutral-950 dark:text-white">Filter & Sort Cuts</h3>
                <p className="text-xs text-neutral-500">
                  {filteredProducts.length} cuts match criteria
                </p>
              </div>
              <div className="flex items-center gap-2">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:underline min-h-[44px] px-2 cursor-pointer"
                  >
                    Reset All
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(false)}
                  className="min-h-[44px] min-w-[44px] rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 hover:text-neutral-900 dark:hover:text-white cursor-pointer"
                  aria-label="Close filters"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              {/* Category */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 block">
                  Category
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`min-h-[44px] p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer text-left ${
                        selectedCategory === cat
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100 shadow-2xs'
                          : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cut Style */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 block">
                  Cut Style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CUT_STYLES.map((cut) => (
                    <button
                      key={cut}
                      type="button"
                      onClick={() => setSelectedCutStyle(cut)}
                      className={`min-h-[44px] p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer text-left truncate ${
                        selectedCutStyle === cut
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100 shadow-2xs'
                          : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {cut === 'All' ? 'All Cuts' : cut}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Budget */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 block">
                  Price Budget
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {PRICE_FILTERS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => setPriceBudget(f.value)}
                      className={`min-h-[44px] p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer text-left ${
                        priceBudget === f.value
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100 shadow-2xs'
                          : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sort By */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300 block">
                  Sort By
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { label: 'Featured Cuts', value: 'featured' },
                    { label: 'Price: Low to High', value: 'price-asc' },
                    { label: 'Price: High to Low', value: 'price-desc' }
                  ].map((s) => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSortBy(s.value as any)}
                      className={`min-h-[44px] p-2.5 rounded-xl border text-xs font-bold transition cursor-pointer text-left ${
                        sortBy === s.value
                          ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100 shadow-2xs'
                          : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* In-Stock Toggle */}
              <div className="pt-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={inStockOnly}
                  onClick={() => setInStockOnly(!inStockOnly)}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-bold cursor-pointer select-none transition ${
                    inStockOnly
                      ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 border-neutral-900 dark:border-neutral-100'
                      : 'bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 border-neutral-200 dark:border-neutral-700'
                  }`}
                >
                  <span>In-Stock Cuts Only</span>
                  <span className={`w-2.5 h-2.5 rounded-full ${inStockOnly ? 'bg-emerald-400 dark:bg-emerald-600' : 'bg-neutral-400'}`} />
                </button>
              </div>
            </div>

            {/* Sticky Bottom Apply Action */}
            <div className="p-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shrink-0">
              <button
                type="button"
                onClick={() => setIsMobileFilterOpen(false)}
                className="w-full btn-buy-primary py-3 rounded-xl text-sm font-bold min-h-[44px] cursor-pointer shadow-md"
              >
                Apply Filters ({sortedProducts.length} Cuts)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Typo Tolerance Suggestion Banner (Item 9) */}
      {typoSearchResult.isTypoCorrected && typoSearchResult.suggestedTerm && (
        <div className="p-3 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-xs text-neutral-700 dark:text-neutral-300 flex items-center justify-between gap-2">
          <span>Showing results for <strong>{typoSearchResult.suggestedTerm}</strong> (searched for "{searchQuery}")</span>
          <button
            type="button"
            onClick={() => setSearchQuery(typoSearchResult.suggestedTerm!)}
            className="text-xs font-bold text-neutral-900 dark:text-white underline hover:no-underline cursor-pointer"
          >
            Search {typoSearchResult.suggestedTerm}
          </button>
        </div>
      )}

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-neutral-600 dark:text-neutral-400 px-1">
        <span>Showing <strong>{sortedProducts.length}</strong> available {sortedProducts.length === 1 ? 'cut' : 'cuts'}</span>
      </div>

      {/* Product Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="catalog-skeletons">
          <ProductCardSkeleton count={8} />
        </div>
      ) : sortedProducts.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {sortedProducts.map((product) => {
            const inCartItem = items.find(i => i.product.id === product.id);
            const inCartQty = inCartItem?.quantity || 0;
            const imgSrc = product.image || product.imageUrl || `/images/products/${product.id}.webp`;
            const savings = product.mrp && product.mrp > product.price ? product.mrp - product.price : 0;
            const savingsPercent = product.mrp && product.mrp > product.price
              ? Math.round(((product.mrp - product.price) / product.mrp) * 100)
              : 0;

            return (
              <article
                key={product.id}
                data-testid={`catalog-card-${product.id}`}
                onClick={() => onNavigateToProduct(product.id)}
                className="group bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-2xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
              >
                {/* Platter Photo */}
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
                </div>

                {/* Card Info */}
                <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <h2 className="text-sm font-bold text-neutral-900 dark:text-white leading-snug line-clamp-1 group-hover:underline">
                      {product.name}
                    </h2>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      {product.netWeight ? `Net: ${product.netWeight}` : product.unit || '500g'} • {product.cutStyle || 'Fresh Cut'}
                    </p>
                  </div>

                  {/* Pricing Matrix & Buy Button */}
                  <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base sm:text-lg font-black text-neutral-900 dark:text-white">
                          ₹{product.price}
                        </span>
                        {product.mrp && product.mrp > product.price && (
                          <span className="text-xs text-neutral-600 dark:text-neutral-400 line-through">
                            ₹{product.mrp}
                          </span>
                        )}
                      </div>
                      {savings > 0 && (
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block">
                          {savingsPercent}% OFF
                        </span>
                      )}
                    </div>

                    {/* Buy Action Button */}
                    <div>
                      {inCartQty > 0 ? (
                        <QuantityStepper
                          quantity={inCartQty}
                          onIncrement={() => updateQuantity(inCartItem!.id || product.id, inCartQty + 1)}
                          onDecrement={() => updateQuantity(inCartItem!.id || product.id, inCartQty - 1)}
                          itemName={product.name}
                        />
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
      ) : (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-8 sm:p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-500 mx-auto">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-neutral-900 dark:text-white">
              {searchQuery.trim() ? `No fresh cuts found matching "${searchQuery}"` : 'No cuts match your current filters'}
            </p>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mt-1 max-w-sm mx-auto">
              Try searching with popular cuts or reset filters to browse all fresh meats.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 justify-center pt-1">
            {['Chicken', 'Mutton', 'Seafood', 'Steaks', 'Boneless'].map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setSearchQuery(term);
                  setSelectedCategory('All');
                }}
                className="px-3 py-1.5 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 text-xs font-medium border border-neutral-200 dark:border-neutral-700 cursor-pointer"
              >
                {term}
              </button>
            ))}
          </div>

          <div className="pt-2">
            <button
              onClick={resetFilters}
              className="px-5 py-2.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 font-bold text-xs rounded-xl cursor-pointer hover:bg-black dark:hover:bg-white transition"
            >
              Clear All Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
