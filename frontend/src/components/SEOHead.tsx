import React, { useEffect } from 'react';
import type { Product } from '../types';

export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://brisketbox.vercel.app').replace(/\/$/, '');

interface SEOHeadProps {
  title?: string;
  description?: string;
  path?: string;
  image?: string;
  product?: Product | null;
}

export const SEOHead: React.FC<SEOHeadProps> = ({
  title = 'BrisketBox | Freshness, Sealed with Flavour',
  description = 'Fresh chicken, mutton and coastal seafood cut daily and delivered cold in reusable cold boxes.',
  path = '/',
  image = '/images/hero_banner_meat.webp',
  product
}) => {
  const canonicalUrl = `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const fullImageUrl = image.startsWith('http') ? image : `${SITE_URL}${image.startsWith('/') ? image : `/${image}`}`;

  useEffect(() => {
    // 1. Page Title
    document.title = title;

    // Helper to set or create meta tag
    const setMeta = (attrName: string, attrVal: string, contentVal: string) => {
      let el = document.querySelector(`meta[${attrName}="${attrVal}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attrName, attrVal);
        document.head.appendChild(el);
      }
      el.setAttribute('content', contentVal);
    };

    // Helper for link tags
    const setLink = (rel: string, href: string) => {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    // 2. Standard Meta
    setMeta('name', 'description', description);
    setLink('canonical', canonicalUrl);

    // 3. Open Graph Tags
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', canonicalUrl);
    setMeta('property', 'og:image', fullImageUrl);
    setMeta('property', 'og:type', product ? 'product' : 'website');

    // 4. Twitter Card Tags
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', fullImageUrl);

    // 5. Product Structured Data (JSON-LD) - strictly from real data only
    const existingJsonLd = document.getElementById('seo-product-schema');
    if (existingJsonLd) {
      existingJsonLd.remove();
    }

    if (product) {
      const script = document.createElement('script');
      script.id = 'seo-product-schema';
      script.type = 'application/ld+json';

      const schema: Record<string, any> = {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.name,
        image: fullImageUrl,
        description: product.description || `${product.name} - Fresh cut, cleaned and sealed cold.`,
        sku: product.id,
        offers: {
          '@type': 'Offer',
          url: canonicalUrl,
          priceCurrency: 'INR',
          price: product.price,
          itemCondition: 'https://schema.org/NewCondition',
          availability: (product.stock > 0 && product.inStock !== false)
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock'
        }
      };

      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }

    return () => {
      const schemaScript = document.getElementById('seo-product-schema');
      if (schemaScript) schemaScript.remove();
    };
  }, [title, description, canonicalUrl, fullImageUrl, product]);

  return null;
};
