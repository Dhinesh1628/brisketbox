import type React from 'react';

/**
 * Image helper utility for BrisketBox Phase 6 Performance
 * Ensures all image paths resolve to modern optimized WebP assets with fallback safety
 */
export const DEFAULT_FALLBACK_IMAGE = '/images/placeholder.webp';

export function optimizeImageUrl(url?: string | null, fallback = DEFAULT_FALLBACK_IMAGE): string {
  if (!url) return fallback;
  return url.replace(/\.(jpg|jpeg|png)$/i, '.webp');
}

export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement, Event>,
  fallback = DEFAULT_FALLBACK_IMAGE
) {
  const target = event.currentTarget;
  if (target.src && !target.src.endsWith(fallback)) {
    target.src = fallback;
  }
}
