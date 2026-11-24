import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  ShieldCheck, 
  Flame, 
  Snowflake, 
  Clock, 
  Package, 
  Compass, 
  ThermometerSnowflake 
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useSound } from '../context/SoundContext';
import type { Product } from '../types';

interface HeroSectionProps {
  onExploreCuts: () => void;
  onNavigateToReturns: () => void;
}

interface BannerSlide {
  id: string;
  badge: string;
  categoryName: string;
  shortCategory: string;
  title: string;
  shortTitle: string;
  subtitle: string;
  description: string;
  price: number;
  mrp: number;
  unit: string;
  rawImage: string;
  cookedImage: string;
  cookedTitle: string;
  cutTag: string;
  accentHex: string;
  productData: Product;
}

const HERO_SLIDES: BannerSlide[] = [
  {
    id: 'prod_1',
    badge: 'Coastal Catch • Fresh Cut',
    categoryName: 'Coastal Sea Fish',
    shortCategory: 'Sea Fish',
    title: 'Surmai (Seer Fish) Prime Steaks',
    shortTitle: 'Surmai Seer Steaks',
    subtitle: 'Center-Cut Round Steaks • Cleaned & Descaled',
    description: 'Firm, pearlescent flaky steaks trimmed with zero off-flavors, chilled for instant pan searing.',
    price: 649,
    mrp: 699,
    unit: '500g',
    rawImage: '/images/products/prod_1.webp',
    cookedImage: '/images/products/cooked_surmai_tawa_fry.webp',
    cookedTitle: 'Crispy Coastal Tawa Fry',
    cutTag: 'Center Cut Steaks',
    accentHex: '#0284c7',
    productData: {
      id: 'prod_1',
      name: 'Surmai (Seer Fish) Steaks',
      category: 'fish',
      description: 'Fresh coastal seer fish, center cut into thick steaks. Cleaned and ready for tawa fry.',
      price: 649,
      mrp: 699,
      unit: '500g',
      chillingMethod: 'Chilled with ice packs',
      cutStyle: 'Center-cut steaks',
      stock: 35,
      image: '/images/products/prod_1.webp'
    }
  },
  {
    id: 'prod_4',
    badge: 'Fresh Batch • Tender Cut',
    categoryName: 'Mutton Cuts',
    shortCategory: 'Prime Mutton',
    title: 'Rich Mutton Biryani & Curry Cut',
    shortTitle: 'Mutton Curry Cut',
    subtitle: 'Balanced Ribs & Tender Shoulder',
    description: 'Freshly cut tender bone-in pieces, meticulously trimmed of excess tallow and slow-chilled. Crafted for aromatic dum biryanis and velvety rogan josh.',
    price: 549,
    mrp: 599,
    unit: '500g',
    rawImage: '/images/products/prod_4.webp',
    cookedImage: '/images/products/cooked_mutton_rogan_josh.webp',
    cookedTitle: 'Velvety Rogan Josh',
    cutTag: 'Bone-in Curry Cut',
    accentHex: '#d11243',
    productData: {
      id: 'prod_4',
      name: 'Mutton Rogan Josh',
      category: 'mutton',
      description: 'Tender goat cuts with rib and shoulder pieces.',
      price: 549,
      mrp: 599,
      unit: '500g',
      chillingMethod: 'Chilled with ice packs',
      cutStyle: 'Bone-in curry cut',
      stock: 22,
      image: '/images/products/prod_4.webp'
    }
  },
  {
    id: 'prod_6',
    badge: 'Country Poultry • Tender Cut',
    categoryName: 'Country Poultry',
    shortCategory: 'Country Poultry',
    title: 'Nati Koli (Country Chicken) Cut',
    shortTitle: 'Nati Koli Chicken',
    subtitle: 'Dense & Lean Muscle Texture',
    description: 'Country chicken with natural flavor. Expertly portioned for slow-cooked traditional pepper gravies.',
    price: 389,
    mrp: 429,
    unit: '500g',
    rawImage: '/images/products/prod_6.webp',
    cookedImage: '/images/products/cooked_nati_koli.webp',
    cookedTitle: 'Spiced Pepper Roast',
    cutTag: 'Traditional Curry Cut',
    accentHex: '#d97706',
    productData: {
      id: 'prod_6',
      name: 'Country Chicken Curry Cut',
      category: 'chicken',
      description: 'Country chicken cut into curry pieces with firm meat and rich flavor.',
      price: 389,
      mrp: 429,
      unit: '500g',
      chillingMethod: 'Chilled with ice packs',
      cutStyle: 'Curry cut',
      stock: 45,
      image: '/images/products/prod_6.webp'
    }
  },
  {
    id: 'prod_3',
    badge: 'Ready to Cook • Tail-On Cleaned',
    categoryName: 'Crustaceans',
    shortCategory: 'Sea Prawns',
    title: 'Jumbo Sea Prawns (Tail-On)',
    shortTitle: 'Jumbo Sea Prawns',
    subtitle: 'De-veined Cleaned Catch • Ready to Cook',
    description: 'Plump prawns carefully deveined with the tail preserved for maximum caramelization. Pristine snap and sweet ocean finish for garlic butter sautés.',
    price: 599,
    mrp: 679,
    unit: '350g',
    rawImage: '/images/products/prod_3.webp',
    cookedImage: '/images/products/cooked_tiger_prawns.webp',
    cookedTitle: 'Garlic Butter Prawns',
    cutTag: 'Tail-on Deveined',
    accentHex: '#0d9488',
    productData: {
      id: 'prod_3',
      name: 'Jumbo Prawns',
      category: 'fish',
      description: 'Peeled and deveined prawns with tail-on.',
      price: 599,
      mrp: 679,
      unit: '350g',
      chillingMethod: 'Chilled with ice packs',
      cutStyle: 'Tail-on deveined',
      stock: 28,
      image: '/images/products/prod_3.webp'
    }
  }
];

export const HeroSection: React.FC<HeroSectionProps> = ({
  onExploreCuts,
  onNavigateToReturns
}) => {
  const { addItem } = useCart();
  const { playPopSound } = useSound();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewCooked, setViewCooked] = useState(false);
  const [addedCutId, setAddedCutId] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [slideProgress, setSlideProgress] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const currentSlide = HERO_SLIDES[currentIndex];

  // Reset cooked view whenever slide changes
  useEffect(() => {
    setViewCooked(false);
    setSlideProgress(0);
  }, [currentIndex]);

  // Smooth slide progress counter and auto-advance every 5.5s
  useEffect(() => {
    if (isHovered) return;

    const intervalTime = 55;
    const totalTicks = 5500 / intervalTime;

    const timer = setInterval(() => {
      setSlideProgress((prev) => {
        if (prev >= 100) {
          setCurrentIndex((current) => (current + 1) % HERO_SLIDES.length);
          return 0;
        }
        return prev + (100 / totalTicks);
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isHovered, currentIndex]);

  const handleNext = () => {
    setSlideProgress(0);
    setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length);
  };

  const handlePrev = () => {
    setSlideProgress(0);
    setCurrentIndex((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientX;
    const diff = touchStart - touchEnd;
    if (diff > 50) handleNext();
    if (diff < -50) handlePrev();
    setTouchStart(null);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    playPopSound();
    addItem(
      currentSlide.productData,
      1,
      currentSlide.cutTag,
      currentSlide.unit,
      currentSlide.price,
      currentSlide.mrp
    );
    setAddedCutId(currentSlide.id);
    setTimeout(() => setAddedCutId(null), 1800);
  };

  return (
    <div className="space-y-3.5">
      {/* Unified Cinematic Showcase Console */}
      <section
        aria-label="Meat & Seafood Showcase"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden bg-[#0c0d10] text-white border border-neutral-800 shadow-xl transition-all duration-500"
      >
        {/* Dynamic Theatrical Ambient Glow */}
        <div 
          className="absolute -top-24 -left-24 w-80 h-80 rounded-full blur-[130px] pointer-events-none transition-all duration-1000 opacity-60"
          style={{ backgroundColor: currentSlide.accentHex }}
        />
        <div 
          className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full blur-[140px] pointer-events-none transition-all duration-1000 opacity-40"
          style={{ backgroundColor: currentSlide.accentHex }}
        />

        {/* Subtle Slate Background Texture */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(#ffffff0a_1px,transparent_1px)] [background-size:20px_20px] opacity-30 pointer-events-none" />

        {/* Main Content Stage Grid with Generous Gutter Clearance for Carousel Controls */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 items-center gap-4 sm:gap-6 px-4 sm:px-14 lg:px-16 py-4 sm:py-8 lg:py-9">
          
          {/* Left Column: Freshness Telemetry, Headline & Action */}
          <div className="md:col-span-7 space-y-3 sm:space-y-4">
            
            {/* Freshness Telemetry Chips */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-0.5 sm:py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-[11px] sm:text-xs font-semibold text-rose-300">
                <span className="w-2 h-2 rounded-full bg-[#d11243] animate-pulse" />
                <span>{currentSlide.badge}</span>
              </div>

              <div className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-cyan-300 text-[11px] sm:text-xs font-semibold">
                <ThermometerSnowflake className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-cyan-400" />
                <span>Chilled Packaging</span>
              </div>

              <div className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Daily Cut Dispatch</span>
              </div>
            </div>

            {/* Headline and Taxonomy */}
            <div className="space-y-1 sm:space-y-2">
              <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                <Compass className="w-3 h-3 text-[#d11243]" />
                <span className="text-white">{currentSlide.categoryName}</span>
              </div>

              <h1 className="text-xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-tight">
                {currentSlide.title}
              </h1>

              <p className="text-xs sm:text-sm font-semibold text-rose-200/90 tracking-wide leading-snug">
                {currentSlide.subtitle}
              </p>
            </div>

            {/* Editorial Description - hidden on mobile to avoid heavy scrolling */}
            <p className="hidden sm:block text-xs sm:text-sm text-neutral-300/80 max-w-xl leading-relaxed pt-1">
              {currentSlide.description}
            </p>

            {/* Pricing Matrix & Call to Action */}
            <div className="pt-1 flex flex-wrap items-center gap-3 sm:gap-6">
              <div className="flex items-baseline gap-1.5 sm:gap-2">
                <span className="text-xl sm:text-3xl font-black text-white">
                  ₹{currentSlide.price}
                </span>
                <span className="text-xs sm:text-sm text-neutral-500 line-through">
                  ₹{currentSlide.mrp}
                </span>
                <span className="text-[10px] sm:text-xs font-bold text-emerald-400 bg-emerald-500/15 px-1.5 sm:px-2 py-0.5 rounded border border-emerald-500/25">
                  {Math.round(((currentSlide.mrp - currentSlide.price) / currentSlide.mrp) * 100)}% OFF
                </span>
                <span className="text-[11px] sm:text-xs text-neutral-400 font-semibold">
                  / {currentSlide.unit}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className={`min-h-[44px] min-w-[44px] px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-md cursor-pointer transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white ${
                    addedCutId === currentSlide.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#d11243] hover:bg-[#b80f3b] text-white hover:shadow-rose-900/40 active:scale-95'
                  }`}
                >
                  {addedCutId === currentSlide.id ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Added to Chill Box</span>
                    </>
                  ) : (
                    <>
                      <span>Add to Chill Box</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onExploreCuts}
                  className="min-h-[44px] min-w-[44px] px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-xs border border-white/15 backdrop-blur-md cursor-pointer transition flex items-center justify-center focus-visible:ring-2 focus-visible:ring-white"
                >
                  View All Cuts
                </button>
              </div>
            </div>

            {/* Preparation Notice */}
            <div className="flex items-center gap-2 text-[10px] sm:text-[11px] text-neutral-400 pt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Cut to order and sealed for fresh delivery.</span>
            </div>
          </div>

          {/* Right Column: Floating Platter with Raw ↔ Cooked Interactive Switch */}
          <div className="md:col-span-5 flex flex-col items-center justify-center relative">
            <div className="relative w-48 h-48 sm:w-72 sm:h-72 lg:w-80 lg:h-80 rounded-2xl overflow-hidden border border-white/15 shadow-2xl bg-neutral-900 group">
              
              {/* Product Visual */}
              <img
                src={viewCooked ? currentSlide.cookedImage : currentSlide.rawImage}
                alt={viewCooked ? currentSlide.cookedTitle : currentSlide.title}
                width={640}
                height={640}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                fetchPriority="high"
              />

              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/25 pointer-events-none" />

              {/* Raw vs Cooked Toggle Pill */}
              <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-20">
                <div className="flex items-center bg-black/80 backdrop-blur-md rounded-full p-1 border border-white/20 shadow-md">
                  <button
                    type="button"
                    onClick={() => setViewCooked(false)}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-white ${
                      !viewCooked
                        ? 'bg-[#d11243] text-white'
                        : 'text-neutral-300 hover:text-white'
                    }`}
                  >
                    <Snowflake className="w-3.5 h-3.5" />
                    <span>Raw Cut</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setViewCooked(true)}
                    className={`min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all duration-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-white ${
                      viewCooked
                        ? 'bg-amber-600 text-white'
                        : 'text-neutral-300 hover:text-white'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-300" />
                    <span>Cooked Dish</span>
                  </button>
                </div>

                <div className="inline-flex items-center gap-1 bg-black/70 backdrop-blur-md px-2 py-0.5 rounded-full border border-white/15 text-[10px] font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Chilled</span>
                </div>
              </div>

              {/* Platter Bottom Label */}
              <div className="absolute bottom-2.5 left-2.5 right-2.5 z-20 flex items-center justify-between bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/15 text-xs">
                <div className="min-w-0 pr-2">
                  <div className="text-[9px] text-neutral-400 font-medium">
                    {viewCooked ? 'Culinary Inspiration' : 'Butcher Cut'}
                  </div>
                  <div className="font-bold text-white text-[11px] leading-tight truncate">
                    {viewCooked ? currentSlide.cookedTitle : currentSlide.cutTag}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[9px] text-neutral-400 font-medium">Cold Chain</div>
                  <div className="font-bold text-cyan-300 text-[11px]">
                    Chilled
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-2 text-[10px] text-neutral-400 flex items-center gap-1">
              <span>Switch between</span>
              <span className="px-1.5 py-0.2 rounded bg-white/10 text-white text-[9px] font-semibold border border-white/10">Raw</span>
              <span>and</span>
              <span className="px-1.5 py-0.2 rounded bg-white/10 text-white text-[9px] font-semibold border border-white/10">Cooked</span>
              <span>to preview dishes</span>
            </div>
          </div>
        </div>

        {/* Carousel Arrow Controls - Positioned in the clean gutter without overlapping copy or platter */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous culinary cut"
          className="absolute left-2 sm:left-3.5 top-1/2 -translate-y-1/2 z-20 min-h-[44px] min-w-[44px] w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 backdrop-blur-md flex items-center justify-center cursor-pointer transition shadow-lg active:scale-95"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleNext}
          aria-label="Next culinary cut"
          className="absolute right-2 sm:right-3.5 top-1/2 -translate-y-1/2 z-20 min-h-[44px] min-w-[44px] w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 backdrop-blur-md flex items-center justify-center cursor-pointer transition shadow-lg active:scale-95"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* DOCKED Bento Timeline Navigator - Seamlessly integrated at bottom of hero card */}
        <div className="relative z-10 border-t border-white/10 bg-black/40 backdrop-blur-md px-3 sm:px-6 py-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {HERO_SLIDES.map((slide, idx) => {
              const isActive = idx === currentIndex;
              return (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => {
                    setSlideProgress(0);
                    setCurrentIndex(idx);
                  }}
                  className={`relative overflow-hidden text-left p-2 sm:p-2.5 rounded-xl border transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-white/15 text-white border-white/30 shadow-md ring-1 ring-white/20'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border-white/10'
                  }`}
                >
                  {/* Active Progress Bar along top edge */}
                  {isActive && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/20">
                      <div
                        className="h-full bg-[#d11243] transition-all duration-75 ease-linear"
                        style={{ width: `${slideProgress}%` }}
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <img
                      src={slide.rawImage}
                      alt={slide.title}
                      className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg object-cover border border-white/15 shrink-0"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="text-[9px] font-bold uppercase tracking-wider text-rose-300 truncate">
                        {slide.shortCategory}
                      </div>
                      <div className="text-xs font-bold leading-tight text-white truncate">
                        {slide.shortTitle}
                      </div>
                      <div className="text-[10px] text-neutral-400 font-semibold flex items-center gap-1.5">
                        <span>₹{slide.price}</span>
                        <span className="text-emerald-400">In Stock</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* 4-Point Brand Trust Ribbon with Reusable Box & Cold-Chain Packaging */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/70 text-[#d11243] flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white">Cold-Chain Delivery</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">Insulated chilled courier</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-cyan-50 dark:bg-cyan-950/70 text-cyan-600 flex items-center justify-center shrink-0">
            <ThermometerSnowflake className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white">Chilled Packaging</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">Chilled freshness</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white">Fresh Cut Standards</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400">Sealed & cleaned</div>
          </div>
        </div>

        <button
          type="button"
          onClick={onNavigateToReturns}
          className="bg-white dark:bg-slate-900 hover:bg-gray-50 dark:hover:bg-slate-800 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs text-left cursor-pointer transition"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-600 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white">ThermalVault™ Box</div>
            <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold">₹0 Deposit • Free Return</div>
          </div>
        </button>
      </div>
    </div>
  );
};
