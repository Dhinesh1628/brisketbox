import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Check, 
  ChevronLeft, 
  ChevronRight, 
  Sparkles,
  ShieldCheck,
  Zap,
  ThermometerSnowflake,
  Clock,
  Award,
  Package
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
  badgeIcon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  description: string;
  price: number;
  mrp: number;
  unit: string;
  image: string;
  cookedImage: string;
  cutTag: string;
  accentColor: string;
  bgClass: string;
  productData: Product;
}

const HERO_SLIDES: BannerSlide[] = [
  {
    id: 'prod_4',
    badge: 'Chef Choice • Fresh Today',
    badgeIcon: Award,
    title: 'Rich Mutton Biryani & Curry Cut',
    subtitle: 'Artisanal Young Goat • Ribs & Shoulder Pieces',
    description: 'Freshly cut, tender bone-in pieces slow-chilled at 0°C to 4°C. Perfect for weekend dum biryani and rich rogan josh curries.',
    price: 549,
    mrp: 599,
    unit: '500g',
    image: '/images/products/prod_4.jpg',
    cookedImage: '/images/products/cooked_mutton_rogan_josh.jpg',
    cutTag: 'Bone-in Curry Cut',
    accentColor: '#d11243',
    bgClass: 'from-stone-900 via-neutral-900 to-black',
    productData: {
      id: 'prod_4',
      name: 'Mutton Rogan Josh',
      category: 'mutton',
      description: 'Tender young goat cuts with rib and shoulder pieces.',
      price: 549,
      mrp: 599,
      unit: '500g',
      chillingMethod: 'Chilled at 0°C to 4°C',
      catchDate: 'Fresh today',
      origin: 'Dindigul Farms',
      cutStyle: 'Bone-in curry cut',
      stock: 22,
      image: '/images/products/prod_4.jpg'
    }
  },
  {
    id: 'prod_1',
    badge: 'Coastal Daily Catch • Harbor Fresh',
    badgeIcon: Sparkles,
    title: 'Surmai (Seer Fish) Prime Steaks',
    subtitle: 'Center-Cut Round Steaks • Cleaned & Descaled',
    description: 'Sourced daily from coastal harbor landings. Firm, flaky steaks trimmed with zero off-flavors, chilled continuously for immediate tawa fry.',
    price: 649,
    mrp: 699,
    unit: '500g',
    image: '/images/products/prod_1.jpg',
    cookedImage: '/images/products/cooked_surmai_tawa_fry.jpg',
    cutTag: 'Center Cut Steaks',
    accentColor: '#0284c7',
    bgClass: 'from-slate-900 via-neutral-900 to-black',
    productData: {
      id: 'prod_1',
      name: 'Surmai (Seer Fish) Steaks',
      category: 'fish',
      description: 'Fresh coastal seer fish, center cut into thick steaks. Cleaned and ready for tawa fry.',
      price: 649,
      mrp: 699,
      unit: '500g',
      chillingMethod: 'Chilled at 0°C to 4°C',
      catchDate: 'Today landing',
      origin: 'Mangalore Coast',
      cutStyle: 'Center-cut steaks',
      stock: 35,
      image: '/images/products/prod_1.jpg'
    }
  },
  {
    id: 'prod_6',
    badge: 'Farm Fresh • Naturally Reared',
    badgeIcon: ShieldCheck,
    title: 'Country Chicken (Nati Koli) Curry Cut',
    subtitle: '100% Antibiotic-Residue Free • Firm Texture',
    description: 'Free-roaming country chicken with rich, earthy flavor and tender meat. Pre-cleaned and expertly portioned for traditional slow pepper curries.',
    price: 389,
    mrp: 429,
    unit: '500g',
    image: '/images/products/prod_6.jpg',
    cookedImage: '/images/products/cooked_nati_koli.jpg',
    cutTag: 'Traditional Curry Cut',
    accentColor: '#ea580c',
    bgClass: 'from-amber-950 via-neutral-900 to-black',
    productData: {
      id: 'prod_6',
      name: 'Country Chicken Curry Cut',
      category: 'chicken',
      description: 'Country chicken cut into curry pieces with firm meat and rich flavor.',
      price: 389,
      mrp: 429,
      unit: '500g',
      chillingMethod: 'Chilled at 0°C to 4°C',
      catchDate: 'Fresh today',
      origin: 'Local Farms',
      cutStyle: 'Curry cut',
      stock: 45,
      image: '/images/products/prod_6.jpg'
    }
  },
  {
    id: 'prod_3',
    badge: 'Ready to Cook • Peeled & Deveined',
    badgeIcon: Zap,
    title: 'Jumbo Sea Prawns (Tail-On)',
    subtitle: 'Juicy Coastal Catch • Zero Preservatives',
    description: 'Plump ocean prawns carefully deveined with tail shells left intact for superior pan-searing. Ideal for garlic butter, tandoori, and biryani.',
    price: 599,
    mrp: 679,
    unit: '350g',
    image: '/images/products/prod_3.jpg',
    cookedImage: '/images/products/cooked_tiger_prawns.jpg',
    cutTag: 'Tail-on Deveined',
    accentColor: '#0d9488',
    bgClass: 'from-teal-950 via-neutral-900 to-black',
    productData: {
      id: 'prod_3',
      name: 'Jumbo Prawns',
      category: 'fish',
      description: 'Peeled and deveined sea prawns with tail-on.',
      price: 599,
      mrp: 679,
      unit: '350g',
      chillingMethod: 'Chilled at 0°C to 4°C',
      catchDate: 'Today catch',
      origin: 'Karwar Coast',
      cutStyle: 'Tail-on deveined',
      stock: 28,
      image: '/images/products/prod_3.jpg'
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
  const [addedCutId, setAddedCutId] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const currentSlide = HERO_SLIDES[currentIndex];

  // Silky 5-second auto-slide interval (pauses on hover)
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [isHovered]);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % HERO_SLIDES.length);
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

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

  const BadgeIcon = currentSlide.badgeIcon;

  return (
    <div className="space-y-4">
      {/* Main Showcase Banner */}
      <div
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="relative w-full rounded-2xl md:rounded-3xl overflow-hidden bg-neutral-950 text-white shadow-md border border-neutral-800 transition-all duration-300"
      >
        {/* Background Visual Fade */}
        <div className="absolute inset-0 z-0">
          <img
            key={currentSlide.id}
            src={currentSlide.image}
            alt={currentSlide.title}
            className="w-full h-full object-cover opacity-25 scale-105 filter blur-xs transition-opacity duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/85 to-black/60 md:to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent md:hidden" />
        </div>

        {/* Content Layout */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 items-center gap-6 p-6 sm:p-8 md:p-10 min-h-[380px] sm:min-h-[420px]">
          {/* Left Text Column */}
          <div className="md:col-span-7 space-y-4">
            {/* Top Pill Tags */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-xs font-semibold text-rose-300">
                <BadgeIcon className="w-3.5 h-3.5 text-[#d11243]" />
                <span>{currentSlide.badge}</span>
              </div>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-semibold">
                <ThermometerSnowflake className="w-3.5 h-3.5" />
                <span>0°C to 4°C Fresh</span>
              </div>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold">
                <Clock className="w-3.5 h-3.5" />
                <span>90 Mins Delivery</span>
              </div>
            </div>

            {/* Title & Subtitle */}
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tight leading-tight">
                {currentSlide.title}
              </h1>
              <p className="text-sm sm:text-base font-semibold text-gray-300">
                {currentSlide.subtitle}
              </p>
            </div>

            {/* Description */}
            <p className="text-xs sm:text-sm text-gray-400 max-w-xl line-clamp-2 sm:line-clamp-3 leading-relaxed">
              {currentSlide.description}
            </p>

            {/* Pricing & CTA Controls */}
            <div className="pt-2 flex flex-wrap items-center gap-4">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  ₹{currentSlide.price}
                </span>
                <span className="text-sm text-gray-400 line-through">
                  ₹{currentSlide.mrp}
                </span>
                <span className="text-xs font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  {Math.round(((currentSlide.mrp - currentSlide.price) / currentSlide.mrp) * 100)}% OFF
                </span>
                <span className="text-xs text-gray-400 font-medium">
                  / {currentSlide.unit}
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-sm cursor-pointer transition-all duration-200 ${
                    addedCutId === currentSlide.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#d11243] hover:bg-[#b80f3b] text-white hover:shadow-rose-900/40 active:scale-95'
                  }`}
                >
                  {addedCutId === currentSlide.id ? (
                    <>
                      <Check className="w-4 h-4 stroke-[3]" />
                      <span>Added to Box</span>
                    </>
                  ) : (
                    <>
                      <span>Add to Box</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onExploreCuts}
                  className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-xs border border-white/15 backdrop-blur-md cursor-pointer transition"
                >
                  Explore Cuts
                </button>
              </div>
            </div>
          </div>

          {/* Right Platter Image Column */}
          <div className="md:col-span-5 flex justify-center items-center relative">
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 md:w-80 md:h-80 rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl group">
              <img
                src={currentSlide.image}
                alt={currentSlide.title}
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-[11px] font-semibold text-white/90 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                <span>{currentSlide.cutTag}</span>
                <span className="text-emerald-400 font-bold">In Stock Today</span>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Arrow Controls */}
        <button
          type="button"
          onClick={handlePrev}
          aria-label="Previous slide"
          className="absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 backdrop-blur-md flex items-center justify-center cursor-pointer transition"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <button
          type="button"
          onClick={handleNext}
          aria-label="Next slide"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-black/60 hover:bg-black/90 text-white/80 hover:text-white border border-white/20 backdrop-blur-md flex items-center justify-center cursor-pointer transition"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        {/* Bottom Pagination Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
          {HERO_SLIDES.map((slide, idx) => (
            <button
              key={slide.id}
              onClick={() => setCurrentIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                idx === currentIndex
                  ? 'w-6 bg-[#d11243]'
                  : 'w-2 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Licious-Style 4-Point Trust Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/70 text-[#d11243] flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white truncate">90-Min Express</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Live chilled courier</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/70 text-blue-600 flex items-center justify-center shrink-0">
            <ThermometerSnowflake className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white truncate">0°C to 4°C Maintained</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Never frozen freshness</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white truncate">150+ Safety Checks</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Chemical & antibiotic-free</div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-gray-150 dark:border-slate-800 flex items-center gap-2.5 shadow-2xs">
          <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/70 text-amber-600 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold text-gray-900 dark:text-white truncate">Insulated Chill Box</div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">Free food-grade pack</div>
          </div>
        </div>
      </div>
    </div>
  );
};
