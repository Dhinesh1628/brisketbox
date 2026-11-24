import { test, expect } from '@playwright/test';

const CUSTOMER_ROUTES = ['/', '/catalog', '/product/prod_1'];

test.describe('Customer Route Integrity & Images', () => {
  for (const route of CUSTOMER_ROUTES) {
    test(`No image 404 on route: ${route}`, async ({ page }) => {
      const failedImages: string[] = [];

      page.on('response', (response) => {
        const url = response.url();
        const isImage = response.request().resourceType() === 'image' ||
          /\.(png|jpe?g|webp|svg|gif|avif)(\?.*)?$/i.test(url);
        if (isImage && response.status() === 404) {
          failedImages.push(`${response.status()} ${url}`);
        }
      });

      await page.goto(route, { waitUntil: 'networkidle' });

      // Scroll to bottom to trigger lazy loaded images
      await page.evaluate(async () => {
        await new Promise<void>((resolve) => {
          let totalHeight = 0;
          const distance = 400;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0);
              resolve();
            }
          }, 50);
        });
      });

      await page.waitForLoadState('networkidle');

      expect(failedImages, `Found 404 image requests on ${route}: ${failedImages.join(', ')}`).toEqual([]);
    });
  }
});

test.describe('Product JSON-LD Structured Data', () => {
  test('renders real Product JSON-LD without fake ratings or reviews', async ({ page }) => {
    await page.goto('/product/prod_1', { waitUntil: 'networkidle' });

    const jsonLdContent = await page.evaluate(() => {
      const script = document.querySelector('script#seo-product-schema') ||
                     document.querySelector('script[type="application/ld+json"]');
      return script ? script.textContent : null;
    });

    expect(jsonLdContent).not.toBeNull();
    const data = JSON.parse(jsonLdContent!);
    expect(data['@type']).toBe('Product');
    expect(data.name).toBeTruthy();
    expect(data.image).toBeTruthy();
    expect(data.offers).toBeDefined();
    expect(data.offers.price).toBeGreaterThan(0);
    expect(data.offers.priceCurrency).toBe('INR');
    expect(data.offers.availability).toContain('schema.org');

    // Strictly no fake ratings or reviews
    expect(data.aggregateRating).toBeUndefined();
    expect(data.review).toBeUndefined();
  });
});

test.describe('Mobile Interactive Controls Size (>= 44x44px)', () => {
  for (const route of CUSTOMER_ROUTES) {
    test(`all interactive controls are >= 44x44px on ${route}`, async ({ page, isMobile }) => {
      test.skip(!isMobile, 'Mobile touch target size check only applies to mobile viewports');

      await page.goto(route, { waitUntil: 'networkidle' });

      const smallControls = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"]'));
        const issues: string[] = [];

        elements.forEach(el => {
          const htmlEl = el as HTMLElement;
          const rect = htmlEl.getBoundingClientRect();
          const style = window.getComputedStyle(htmlEl);

          // Skip hidden or detached elements
          if (
            rect.width === 0 ||
            rect.height === 0 ||
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            style.opacity === '0'
          ) {
            return;
          }

          // Allow 0.5px tolerance for subpixel rendering
          if (rect.width < 43.5 || rect.height < 43.5) {
            const text = (htmlEl.innerText || htmlEl.getAttribute('aria-label') || htmlEl.getAttribute('placeholder') || htmlEl.tagName).trim().slice(0, 30);
            issues.push(`<${htmlEl.tagName.toLowerCase()}> "${text}" [${rect.width.toFixed(1)}x${rect.height.toFixed(1)}px]`);
          }
        });

        return issues;
      });

      expect(smallControls, `Found controls smaller than 44x44px on ${route}: \n${smallControls.join('\n')}`).toEqual([]);
    });
  }
});
