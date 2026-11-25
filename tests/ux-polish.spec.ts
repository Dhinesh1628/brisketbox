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

  test('11. Full e-commerce flow: Search typo -> QuantityStepper -> Cart -> 3-step checkout -> Order Confirmation -> Reorder', async ({ page }) => {
    // Set authenticated customer session so checkout opens directly
    await page.addInitScript(() => {
      localStorage.setItem('brisketbox_token', 'test_token');
    });

    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'cust_test',
          name: 'Test Customer',
          email: 'test@example.com',
          phone: '9876543210',
          role: 'customer',
          walletBalance: 0
        })
      });
    });

    // Intercept checkout API to simulate instant order placement
    await page.route('**/api/payments/create-order', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 'BB-FLOW-999',
          orderNumber: 'BB-FLOW-999',
          isCod: true,
          amount: 299,
          order: {
            id: 'BB-FLOW-999',
            orderNumber: 'BB-FLOW-999',
            userId: 'cust_test',
            customerName: 'Test Customer',
            customerEmail: 'test@example.com',
            customerPhone: '9876543210',
            deliveryAddress: 'Flat 101, Test Residency, Outer Ring Road, Bengaluru, Karnataka - 560037',
            deliverySlot: 'Express Chilled Delivery (Live Courier)',
            items: [
              {
                productId: 'prod_1',
                name: 'Fresh Chicken Curry Cut',
                price: 299,
                quantity: 1,
                unit: '500g',
                netWeight: '500g'
              }
            ],
            subtotal: 299,
            coolerDeposit: 0,
            shippingFee: 0,
            total: 299,
            status: 'CONFIRMED',
            paymentMethod: 'cod'
          }
        })
      });
    });

    // 1. Visit Catalog
    await page.goto('/catalog', { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/\/catalog/);

    // 2. Typo Search in catalog
    const searchInput = page.locator('main input[placeholder*="Search chicken"]').first();
    await searchInput.fill('chikn');
    await page.waitForTimeout(400);

    // Typo banner shown
    await expect(page.locator('text=Showing results for').first()).toBeVisible();

    // 3. Add item using Add button
    const addBtn = page.locator('[data-testid^="catalog-card-"] button:has-text("Add")').first();
    await addBtn.click();
    await page.waitForTimeout(500);

    // 4. Cart Drawer opens automatically upon adding item
    const drawer = page.locator('div[role="dialog"][aria-label="Shopping Cart"]').first();
    await expect(drawer).toBeVisible();

    // Check express chilled delivery banner is visible in cart
    await expect(drawer.locator('text=Express Chilled Delivery').first()).toBeVisible();

    // Click Continue to Checkout
    const checkoutBtn = drawer.locator('button:has-text("Continue")').first();
    await checkoutBtn.click();
    await page.waitForTimeout(500);

    // 5. Checkout Modal Step 1: Contact & Address
    const checkoutModal = page.locator('div[role="dialog"] h2:has-text("Checkout")');
    await expect(checkoutModal).toBeVisible();

    // Fill form fields
    await page.locator('input[placeholder*="Full Name"]').fill('Test Customer');
    await page.locator('input[placeholder*="name@example.com"]').fill('test@example.com');
    await page.locator('input[placeholder*="98XXXXXXXX"]').fill('9876543210');
    await page.locator('input[placeholder*="Flat 101"]').fill('Flat 101');
    await page.locator('input[placeholder*="Sunrise Apartments"]').fill('Test Residency');
    await page.locator('input[placeholder*="Outer Ring Road"]').fill('Outer Ring Road');
    await page.locator('input[placeholder="560037"]').fill('560037');

    // Click Continue to Delivery Slot
    const toSlotBtn = page.locator('button:has-text("Continue to Delivery Slot")');
    await toSlotBtn.click();
    await page.waitForTimeout(300);

    // Step 2: Delivery Slot
    await expect(page.locator('text=Choose Delivery Time').first()).toBeVisible();
    const toPaymentBtn = page.locator('button:has-text("Continue to Payment")');
    await toPaymentBtn.click();
    await page.waitForTimeout(300);

    // Step 3: Payment
    await expect(page.locator('text=Choose Payment Method').first()).toBeVisible();
    // Select Cash on Delivery
    await page.locator('text=Cash on Delivery').first().click();

    // Place Order
    const placeOrderBtn = page.locator('button[type="submit"]:has-text("Place Order")').first();
    await placeOrderBtn.click();
    await page.waitForTimeout(500);

    // 6. Order Confirmation Modal
    const orderConfirmedModal = page.locator('#order-confirmation-title');
    await expect(orderConfirmedModal).toBeVisible();
    await expect(page.locator('text=#BB-FLOW-999')).toBeVisible();

    // 7. Click Reorder Items
    const reorderBtn = page.locator('button:has-text("Reorder Items")');
    await expect(reorderBtn).toBeVisible();
    await reorderBtn.click();
    await page.waitForTimeout(400);

    // Toast appears
    await expect(page.locator('[role="status"]').filter({ hasText: /reorder/i })).toBeVisible();
  });

});
