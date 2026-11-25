import React from 'react';

interface ProductCardSkeletonProps {
  count?: number;
}

export const ProductCardSkeleton: React.FC<ProductCardSkeletonProps> = ({ count = 4 }) => {
  return (
    <>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 overflow-hidden shadow-2xs flex flex-col justify-between animate-pulse"
          aria-hidden="true"
        >
          {/* Shimmering Image Area */}
          <div className="w-full aspect-square bg-neutral-100 dark:bg-neutral-800 relative">
            <div className="absolute top-2.5 left-2.5 w-16 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700" />
            <div className="absolute top-2.5 right-2.5 w-12 h-5 rounded-full bg-neutral-200 dark:bg-neutral-700" />
          </div>

          {/* Shimmering Content */}
          <div className="p-3.5 flex-1 flex flex-col justify-between space-y-3">
            <div className="space-y-2">
              <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded-md w-3/4" />
              <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded-md w-1/2" />
            </div>

            {/* Price & Button area */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-2">
              <div className="space-y-1">
                <div className="h-5 bg-neutral-200 dark:bg-neutral-700 rounded-md w-14" />
                <div className="h-3 bg-neutral-100 dark:bg-neutral-800 rounded-md w-10" />
              </div>
              <div className="w-16 h-9 rounded-xl bg-neutral-200 dark:bg-neutral-700" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
};
