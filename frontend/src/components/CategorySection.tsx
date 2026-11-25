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
    image: '/images/products/prod_6.webp',
    badge: 'Fresh Cuts',
    badgeColor: 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
  },
  {
    id: 'mutton',
    name: 'Mutton',
    value: 'Tender Mutton',
    image: '/images/products/prod_4.webp'
  },
  {
    id: 'fish',
    name: 'Fish & Seafood',
    value: 'Fish & Seafood',
    image: '/images/products/prod_1.webp',
    badge: 'Daily Catch',
    badgeColor: 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
  },
  {
    id: 'ready_to_cook',
    name: 'Ready to Cook',
    value: 'Ready to Cook',
    image: '/images/products/prod_7.webp',
    badge: 'NEW',
    badgeColor: 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
  },
  {
    id: 'combos',
    name: 'Combos & Feast',
    value: 'Combo Box',
    image: '/images/products/prod_8.webp',
    badge: 'Save More',
    badgeColor: 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'
  },
  {
    id: 'all',
    name: 'All Cuts',
    value: 'All',
    image: '/images/hero_banner_meat.webp'
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
    <section className="space-y-4 max-w-5xl mx-auto">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-gray-900 dark:text-white tracking-tight">
            Explore by Category
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Fresh chicken, mutton and seafood delivered chilled
          </p>
        </div>

        <button
          onClick={onViewAllSpecs}
          className="min-h-[44px] px-2 text-xs font-bold text-neutral-800 dark:text-neutral-200 hover:text-black dark:hover:text-white flex items-center gap-1 cursor-pointer transition"
        >
          <span>View All</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Licious-Style Circular Platter Grid / Horizontal Scroll */}
      <div className="bg-white dark:bg-slate-900/90 rounded-3xl p-5 sm:p-6 border border-gray-150 dark:border-slate-800 shadow-2xs">
        <div className="flex items-start justify-between gap-4 sm:gap-6 overflow-x-auto pt-4 pb-2 scrollbar-none">
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
                <div className="relative pt-4 pb-0.5">
                  {/* Floating Badge - Neutral style (Rule 9) */}
                  {cat.badge && (
                    <span className={`absolute top-0 left-1/2 -translate-x-1/2 z-30 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-xs ring-1 ring-neutral-300 dark:ring-neutral-700 pointer-events-none whitespace-nowrap leading-tight ${cat.badgeColor || 'bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900'}`}>
                      {cat.badge}
                    </span>
                  )}

                  {/* Circular Plate */}
                  <div
                    className={`w-20 h-20 sm:w-24 sm:h-24 md:w-26 md:h-26 rounded-full overflow-hidden transition-all duration-300 relative bg-neutral-100 dark:bg-neutral-800 border-2 ${
                      isSelected
                        ? 'border-neutral-900 dark:border-white ring-2 ring-neutral-900/20 dark:ring-white/20 shadow-md scale-105'
                        : 'border-slate-200/90 dark:border-slate-700 shadow-xs group-hover:shadow-lg group-hover:scale-105 group-hover:border-gray-300 dark:group-hover:border-slate-600'
                    }`}
                  >
                    <img
                      src={cat.image}
                      alt={cat.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/images/hero_banner_meat.webp';
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
                        ? 'font-black text-neutral-900 dark:text-white'
                        : 'font-semibold text-gray-800 dark:text-gray-200 group-hover:text-black dark:group-hover:text-white'
                    }`}
                  >
                    {cat.name}
                  </span>
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-neutral-900 dark:bg-white mx-auto animate-pulse" />
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
