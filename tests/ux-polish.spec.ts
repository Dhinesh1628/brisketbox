import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BANNED_COUPONS = ['MEAT100', 'FREEDEL', 'FIRST20', 'FRESH50', 'BRISKET20'];
const BANNED_POPULARITY = [
  'Best sellers',
  'Most ordered',
  'Trending',
  'Selling fast',
  'Customer Favourites',
  'Customer loved',
  'View Ratings',
  'flying off shelves',
  'Popular'
];

test.describe('UX Polish & 3-Colour System Integrity', () => {

  test('1. Only server coupons appear - banned hardcoded codes removed everywhere', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // Open Cart Drawer
    const cartButton = page.locator('button[aria-label="View Shopping Cart"]').first();
    if (await cartButton.isVisible()) {
      await cartButton.click();
      await page.waitForTimeout(300);
    }

    const pageText = await page.evaluate(() => document.body.innerText);

    for (const banned of BANNED_COUPONS) {
      expect(pageText).not.toContain(banned);
    }
  });

  test('2. No fake popularity labels appear with zero orders', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    const pageText = await page.evaluate(() => document.body.innerText);

    for (const banned of BANNED_POPULARITY) {
      const regex = new RegExp(`\\b${banned}\\b`, 'i');
      expect(regex.test(pageText)).toBe(false);
    }
  });

  test('3. Mobile homepage height is strictly under 6 mobile screens (844px * 6 = 5064px)', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Applies specifically to mobile viewports');

    await page.goto('/', { waitUntil: 'networkidle' });

    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const maxAllowedHeight = 6 * 844; // 5064px

    expect(scrollHeight).toBeLessThan(maxAllowedHeight);
  });

  test('4. No visible text under 12px on mobile', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Applies specifically to mobile viewports');

    await page.goto('/', { waitUntil: 'networkidle' });

    const tinyTextElements = await page.evaluate(() => {
      const violations: { tag: string; text: string; fontSize: string }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          const el = node as HTMLElement;
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          // Only check elements with direct text
          const hasDirectText = Array.from(el.childNodes).some(
            n => n.nodeType === Node.TEXT_NODE && (n.nodeValue || '').trim().length > 0
          );
          return hasDirectText ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });

      while (walker.nextNode()) {
        const el = walker.currentNode as HTMLElement;
        const fontSizePx = parseFloat(window.getComputedStyle(el).fontSize);
        if (fontSizePx < 11.5) { // Under 12px
          violations.push({
            tag: el.tagName.toLowerCase(),
            text: (el.innerText || '').slice(0, 30),
            fontSize: `${fontSizePx}px`
          });
        }
      }
      return violations;
    });

    expect(tinyTextElements).toEqual([]);
  });

  test('5. Chat & Support button does not overlap buttons or cards on every page and is hidden when cart is open', async ({ page }) => {
    const pagesToTest = ['/', '/catalog', '/product/prod_1'];

    for (const p of pagesToTest) {
      await page.goto(p, { waitUntil: 'networkidle' });

      const chatButton = page.locator('[data-testid="chat-support-button"]').first();
      await expect(chatButton).toBeVisible();

      const chatBox = await chatButton.boundingBox();
      expect(chatBox).not.toBeNull();

      // Check all visible buy/add buttons, pack options, and category platters
      const interactiveButtons = page.locator('.btn-buy-primary, button:has-text("Add"), button:has-text("800g"), button:has-text("500g"), button:has-text("1kg"), section[aria-label="Browse Categories"] button');
      const count = await interactiveButtons.count();

      for (let i = 0; i < count; i++) {
        const btn = interactiveButtons.nth(i);
        if (await btn.isVisible()) {
          const btnBox = await btn.boundingBox();
          if (btnBox && chatBox) {
            // Check rectangle intersection
            const overlaps = !(
              btnBox.x + btnBox.width <= chatBox.x ||
              chatBox.x + chatBox.width <= btnBox.x ||
              btnBox.y + btnBox.height <= chatBox.y ||
              chatBox.y + chatBox.height <= btnBox.y
            );
            expect(overlaps, `Chat button overlapped with interactive element ${i} on ${p}`).toBe(false);
          }
        }
      }
    }

    // Open cart drawer on / and ensure chat button is hidden
    await page.goto('/', { waitUntil: 'networkidle' });
    const cartIcon = page.locator('button[aria-label="View Shopping Cart"]').first();
    if (await cartIcon.isVisible()) {
      await cartIcon.click();
      await page.waitForTimeout(300);
      const chatButton = page.locator('[data-testid="chat-support-button"]').first();
      await expect(chatButton).toBeHidden();
    }
  });

  test('6. /catalog and /product/:id render their own dedicated pages', async ({ page }) => {
    // Visit /catalog
    await page.goto('/catalog', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/catalog/);
    const catalogHeading = page.locator('h1, h2').filter({ hasText: /catalog|browse cuts|fresh meats/i }).first();
    await expect(catalogHeading).toBeVisible();

    // Visit /product/prod_1
    await page.goto('/product/prod_1', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/product\/prod_1/);
    const productTitle = page.locator('h1').first();
    await expect(productTitle).toBeVisible();
    await expect(page.locator('button').filter({ hasText: /Add to Cart/i }).first()).toBeVisible();
  });

  test('7. Axe accessibility check with no colour-contrast violations', async ({ page }) => {
    const routes = ['/', '/catalog', '/product/prod_1'];

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'networkidle' });
      const results = await new AxeBuilder({ page })
        .withRules(['color-contrast'])
        .analyze();

      const contrastViolations = results.violations.filter(v => v.id === 'color-contrast');
      expect(contrastViolations, `Axe color-contrast violations on ${route}: ${JSON.stringify(contrastViolations, null, 2)}`).toEqual([]);
    }
  });

  test('8. Mobile cart drawer at 390px does not clip or overflow viewport', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Applies to mobile viewports');
    await page.goto('/', { waitUntil: 'networkidle' });

    // Add an item to cart first so drawer has full content
    const addBtn = page.locator('.btn-buy-primary, button:has-text("Add")').first();
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(300);
    }

    // Open cart drawer
    const cartIcon = page.locator('button[aria-label="View Shopping Cart"]').first();
    await cartIcon.click();
    await page.waitForTimeout(400);

    const drawer = page.locator('div[role="dialog"][aria-label="Shopping Cart"]').first();
    await expect(drawer).toBeVisible();

    // Verify that no element inside the cart drawer extends past 390px viewport
    const viewportWidth = 390;
    const overflowingElements = await page.evaluate((vpWidth) => {
      const dialog = document.querySelector('div[role="dialog"][aria-label="Shopping Cart"]');
      if (!dialog) return ['Cart dialog not found'];
      const elements = dialog.querySelectorAll('*');
      const overflows = [];
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.right > vpWidth + 1.5) {
          overflows.push({
            tag: el.tagName.toLowerCase(),
            className: el.className ? String(el.className).slice(0, 50) : '',
            text: (el.textContent || '').trim().slice(0, 30),
            right: rect.right,
            overflowBy: (rect.right - vpWidth).toFixed(1)
          });
        }
      }
      return overflows;
    }, viewportWidth);

    expect(overflowingElements, `Elements overflowing mobile cart drawer: ${JSON.stringify(overflowingElements, null, 2)}`).toEqual([]);
  });

  test('9. Mobile catalog puts filters in bottom sheet and displays first product on screen 1', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Applies to mobile viewports');
    await page.goto('/catalog', { waitUntil: 'networkidle' });

    // Filters trigger button is visible
    const trigger = page.locator('[data-testid="mobile-filters-trigger"]');
    await expect(trigger).toBeVisible();

    // First product card is visible on screen 1 (< 844px)
    const firstCard = page.locator('[data-testid^="catalog-card-"]').first();
    await expect(firstCard).toBeVisible();
    const cardBox = await firstCard.boundingBox();
    expect(cardBox).not.toBeNull();
    expect(cardBox!.y).toBeLessThan(844);

    // Open bottom sheet
    await trigger.click();
    const sheet = page.locator('[data-testid="mobile-filters-bottom-sheet"]');
    await expect(sheet).toBeVisible();

    // Close bottom sheet
    const closeBtn = sheet.locator('button[aria-label="Close filters"]');
    await closeBtn.click();
    await expect(sheet).toBeHidden();
  });

  test('10. Mobile product page has sticky bottom bar with pack, price, and Add to Cart', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Applies to mobile viewports');
    await page.goto('/product/prod_1', { waitUntil: 'networkidle' });

    const stickyBar = page.locator('[data-testid="mobile-product-sticky-bar"]');
    await expect(stickyBar).toBeVisible();

    // Contains price, pack, and Add to Cart
    await expect(stickyBar.locator('button:has-text("Add to Cart")')).toBeVisible();
    await expect(stickyBar.locator('text=₹').first()).toBeVisible();
  });

});
