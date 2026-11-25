import { test, expect } from '@playwright/test';

test.describe('Opening Splash Intro & Reload Loading Animation', () => {
  test('displays full cinematic intro on first visit and dismisses on click', async ({ page }) => {
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

  test('does not reappear full opening splash on reload in the same session', async ({ page }) => {
    // Seed session storage
    await page.addInitScript(() => {
      sessionStorage.setItem('brisketbox_splash_seen', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const fullSplash = page.locator('[aria-label="BrisketBox opening intro"]');
    await expect(fullSplash).toHaveCount(0);
  });

  test('displays sleek progress line reload loader on refresh and quickly auto-dissolves', async ({ page }) => {
    // Seed session storage
    await page.addInitScript(() => {
      sessionStorage.setItem('brisketbox_splash_seen', 'true');
    });

    await page.goto('/');
    const reloadLoader = page.locator('[aria-label="BrisketBox loading"]');

    // Should be visible initially during reload
    await expect(reloadLoader).toBeVisible();

    // Progress bar should be present
    const progressBar = reloadLoader.locator('.animate-reload-progress');
    await expect(progressBar).toBeVisible();

    // Auto-dissolves quickly
    await expect(reloadLoader).not.toBeVisible({ timeout: 1500 });
  });

  test('bypasses immediately if prefers-reduced-motion is active', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const splash = page.locator('[role="status"]');
    await expect(splash).toHaveCount(0);
  });
});
