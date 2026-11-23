import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

export interface CategoryCircleItem {
  id: string;
  name: string;
  value: string;
  image: string;
  badge?: string;
  badgeColor?: string;
}

export const CATEGORIES: CategoryCircleItem[] = [
  {
    id: 'chicken',
    name: 'Chicken',
    value: 'Fresh Chicken',
    image: '/images/products/prod_6.jpg',
    badge: 'Farm Fresh',
    badgeColor: 'bg-emerald-600'
  },
  {
    id: 'mutton',
    name: 'Mutton',
    value: 'Tender Mutton',
    image: '/images/products/prod_4.jpg',
    badge: 'Popular',
    badgeColor: 'bg-[#d11243]'
  },
  {
    id: 'fish',
    name: 'Fish & Seafood',
    value: 'Fish & Seafood',
    image: '/images/products/prod_1.jpg',
    badge: 'Daily Catch',
    badgeColor: 'bg-blue-600'
  },
  {
    id: 'ready_to_cook',
    name: 'Ready to Cook',
    value: 'Ready to Cook',
    image: '/images/products/prod_7.jpg',
    badge: 'NEW',
    badgeColor: 'bg-[#d11243]'
  },
  {
    id: 'combos',
    name: 'Combos & Feast',
    value: 'Combo Box',
    image: '/images/products/prod_8.jpg',
    badge: 'Save More',
    badgeColor: 'bg-purple-600'
  },
  {
    id: 'all',
    name: 'All Cuts',
    value: 'All',
    image: '/images/hero_banner_meat.jpg'
  }
];

interface CategorySectionProps {
  selectedCategory: string;
  onSelectCategory: (categoryValue: string) => void;
  onViewAllSpecs?: () => void;
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  selectedCategory,
  onSelectCategory,
  onViewAllSpecs
}) => {
  return (
    <section className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Explore by Category
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Hand-trimmed, vacuum-sealed cuts chilled strictly at 0°C to 4°C
          </p>
        </div>

        <button
          onClick={onViewAllSpecs}
          className="text-xs font-bold text-[#d11243] hover:text-[#b80f3b] flex items-center gap-1 cursor-pointer transition"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Licious-Style Circular Platter Grid / Horizontal Scroll */}
      <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-5 sm:p-6 border border-gray-150 dark:border-slate-800 shadow-2xs">
        <div className="flex items-start justify-between gap-4 sm:gap-6 overflow-x-auto pb-2 scrollbar-none">
          {CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.value;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => onSelectCategory(cat.value)}
                className="flex flex-col items-center flex-1 min-w-[85px] sm:min-w-[100px] cursor-pointer group text-center select-none transition-transform focus:outline-none"
              >
                {/* Circular Platter Plate Container */}
                <div className="relative pt-2.5">
                  {/* Floating Badge (e.g. "NEW", "POPULAR") */}
                  {cat.badge && (
                    <span className={`absolute top-0 left-1/2 -translate-x-1/2 z-10 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white shadow-md border-2 border-white dark:border-slate-900 pointer-events-none whitespace-nowrap ${cat.badgeColor || 'bg-[#d11243]'}`}>
                      {cat.badge}
                    </span>
                  )}

                  {/* Circular Plate */}
                  <div
                    className={`w-20 h-20 sm:w-24 sm:h-24 md:w-26 md:h-26 rounded-full overflow-hidden transition-all duration-300 relative bg-neutral-100 dark:bg-neutral-800 border-2 ${
                      isSelected
                        ? 'border-[#d11243] ring-4 ring-[#d11243]/20 dark:ring-rose-500/20 shadow-md scale-105'
                        : 'border-slate-200/90 dark:border-slate-700 shadow-xs group-hover:shadow-lg group-hover:scale-105 group-hover:border-gray-300 dark:group-hover:border-slate-600'
                    }`}
                  >
                    <img
                      src={cat.image}
                      alt={cat.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/hero_banner_meat.jpg';
                      }}
                    />
                    {/* Subtle Circular Inner Rim Shadow to look like a ceramic plate */}
                    <div className="absolute inset-0 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.25)] pointer-events-none" />
                  </div>
                </div>

                {/* Category Label */}
                <div className="mt-2.5 space-y-0.5">
                  <span
                    className={`block text-xs sm:text-sm tracking-tight transition-colors line-clamp-1 ${
                      isSelected
                        ? 'font-black text-[#d11243] dark:text-rose-400'
                        : 'font-semibold text-gray-800 dark:text-gray-200 group-hover:text-[#d11243] dark:group-hover:text-rose-400'
                    }`}
                  >
                    {cat.name}
                  </span>
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#d11243] mx-auto animate-pulse" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};
