import { test, expect } from '@playwright/test';

const ROUTES = [
  '/',
  '/catalog',
  '/category/chicken',
  '/category/seafood',
  '/product/prod_1',
  '/tracking',
  '/dashboard',
  '/admin',
  '/rider',
  '/partner'
];

for (const route of ROUTES) {
  test.describe(`Route: ${route}`, () => {
    test(`loads with no horizontal scroll`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflowing, `Horizontal overflow detected on ${route}`).toBe(false);

      const root = page.locator('#root');
      await expect(root).toBeVisible();
    });

    test(`refresh works cleanly`, async ({ page }) => {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      await page.reload();
      await page.waitForLoadState('domcontentloaded');

      const isOverflowing = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth;
      });
      expect(isOverflowing, `Horizontal overflow detected after refresh on ${route}`).toBe(false);

      const root = page.locator('#root');
      await expect(root).toBeVisible();
    });
  });
}
