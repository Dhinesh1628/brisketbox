import { test, expect } from '@playwright/test';

test.describe('Opening Splash Intro Animation', () => {
  test('displays on first visit and dismisses on click', async ({ page }) => {
    await page.goto('/');
    const splash = page.locator('[aria-label="BrisketBox opening intro"]');

    // Should be visible initially
    await expect(splash).toBeVisible();

    // Clicking anywhere dismisses it
    await splash.click();

    // Splash should fade out and detach/hide
    await expect(splash).not.toBeVisible({ timeout: 2000 });

    // Session storage should record that splash was seen
    const seen = await page.evaluate(() => sessionStorage.getItem('brisketbox_splash_seen'));
    expect(seen).toBe('true');
  });

  test('does not reappear on page refresh or navigation in the same session', async ({ page }) => {
    // Seed session storage
    await page.addInitScript(() => {
      sessionStorage.setItem('brisketbox_splash_seen', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const splash = page.locator('[aria-label="BrisketBox opening intro"]');
    await expect(splash).toHaveCount(0);
  });

  test('bypasses immediately if prefers-reduced-motion is active', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const splash = page.locator('[aria-label="BrisketBox opening intro"]');
    await expect(splash).toHaveCount(0);
  });
});
