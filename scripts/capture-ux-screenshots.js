import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';
import { spawn } from 'child_process';

const BASE_URL = 'http://127.0.0.1:4173';

function checkPortOpen(url) {
  return new Promise((resolve) => {
    const req = http.get(url, () => resolve(true));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureServer() {
  const isOpen = await checkPortOpen(BASE_URL);
  if (isOpen) return null;

  console.log('[Screenshot] Launching preview server on port 4173...');
  const server = spawn('npm', ['--prefix', 'frontend', 'run', 'preview', '--', '--port', '4173', '--host', '127.0.0.1'], {
    shell: true,
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await checkPortOpen(BASE_URL)) {
      console.log('[Screenshot] Preview server is ready.');
      return server;
    }
  }
  throw new Error('Timeout waiting for preview server.');
}

export async function capture(prefix) {
  const serverProc = await ensureServer();
  const dir = path.resolve('docs/ux');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch();
  try {
    // Desktop: 1440x900
    const dPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    // Home
    await dPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await dPage.screenshot({ path: path.join(dir, `${prefix}-home-desktop.png`), fullPage: false });

    // Catalog
    await dPage.goto(`${BASE_URL}/catalog`, { waitUntil: 'networkidle' });
    await dPage.screenshot({ path: path.join(dir, `${prefix}-catalog-desktop.png`), fullPage: false });

    // Product
    await dPage.goto(`${BASE_URL}/product/prod_1`, { waitUntil: 'networkidle' });
    await dPage.screenshot({ path: path.join(dir, `${prefix}-product-desktop.png`), fullPage: false });

    // Cart
    await dPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    // Click cart button
    const dCartBtn = await dPage.$('button[aria-label*="cart" i], button:has-text("Cart")');
    if (dCartBtn) {
      await dCartBtn.click();
      await dPage.waitForTimeout(600);
    }
    await dPage.screenshot({ path: path.join(dir, `${prefix}-cart-desktop.png`), fullPage: false });
    await dPage.close();

    // Mobile: 390x844
    const mPage = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    // Home
    await mPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    await mPage.screenshot({ path: path.join(dir, `${prefix}-home-mobile.png`), fullPage: false });

    // Catalog
    await mPage.goto(`${BASE_URL}/catalog`, { waitUntil: 'networkidle' });
    await mPage.screenshot({ path: path.join(dir, `${prefix}-catalog-mobile.png`), fullPage: false });

    // Product
    await mPage.goto(`${BASE_URL}/product/prod_1`, { waitUntil: 'networkidle' });
    await mPage.screenshot({ path: path.join(dir, `${prefix}-product-mobile.png`), fullPage: false });

    // Cart
    await mPage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
    const mCartBtn = await mPage.$('button[aria-label*="cart" i], button:has-text("Cart")');
    if (mCartBtn) {
      await mCartBtn.click();
      await mPage.waitForTimeout(600);
    }
    await mPage.screenshot({ path: path.join(dir, `${prefix}-cart-mobile.png`), fullPage: false });
    await mPage.close();

    console.log(`[Screenshot Success] Saved 8 screenshots for prefix '${prefix}' in docs/ux/`);
  } finally {
    await browser.close();
    if (serverProc) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', serverProc.pid.toString(), '/T', '/F']);
      } else {
        serverProc.kill();
      }
    }
  }
}

const prefix = process.argv[2] || 'before';
capture(prefix).catch((err) => {
  console.error('[Screenshot Error]:', err);
  process.exit(1);
});
