/**
 * Image helper utility for BrisketBox Phase 6 Performance
 * Ensures all image paths resolve to modern optimized WebP assets with fallback safety
 */
export function optimizeImageUrl(url?: string | null, fallback = '/images/hero_banner_meat.webp'): string {
  if (!url) return fallback;
  return url.replace(/\.(jpg|jpeg|png)$/i, '.webp');
}
