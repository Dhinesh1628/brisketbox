import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import zlib from 'node:zlib';
import http from 'node:http';

const BUDGET_KB = 170;
const BUDGET_BYTES = BUDGET_KB * 1024;
const BASE_URL = 'http://127.0.0.1:4173';
const ROUTES = ['/', '/catalog', '/product/prod_1'];

function checkPortOpen(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      resolve(true);
    });
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

  console.log('[Bundle Check] Launching preview server on port 4173...');
  const server = spawn('npm', ['--prefix', 'frontend', 'run', 'preview', '--', '--port', '4173', '--host', '127.0.0.1'], {
    shell: true,
    stdio: 'ignore'
  });

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await checkPortOpen(BASE_URL)) {
      console.log('[Bundle Check] Preview server is ready.');
      return server;
    }
  }
  throw new Error('Timeout waiting for preview server to start.');
}

async function main() {
  console.log('='.repeat(65));
  console.log('  PLAYWRIGHT RUNTIME DOWNLOAD & PORTAL ISOLATION CHECK');
  console.log(`  Target: ${BASE_URL} | Budget: <= ${BUDGET_KB} KB gzipped per route`);
  console.log('='.repeat(65));

  const serverProc = await ensureServer();
  let browser;
  let anyFailed = false;

  try {
    browser = await chromium.launch({ headless: true });

    for (const route of ROUTES) {
      console.log(`\n🔍 Checking route: ${route}`);
      const page = await browser.newPage();
      const downloadedFiles = [];

      page.on('response', async (res) => {
        const url = res.url();
        if (url.endsWith('.js') || url.includes('.js?')) {
          const fileName = url.split('/').pop().split('?')[0];
          try {
            const buf = await res.body();
            const rawSize = buf.length;
            const gzipSize = zlib.gzipSync(buf).length;
            downloadedFiles.push({ fileName, url, rawSize, gzipSize });
          } catch {
            // In case of abort or navigation cancel
          }
        }
      });

      await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);

      const totalGzipBytes = downloadedFiles.reduce((acc, f) => acc + f.gzipSize, 0);
      const totalGzipKb = totalGzipBytes / 1024;
      const totalRawKb = downloadedFiles.reduce((acc, f) => acc + f.rawSize, 0) / 1024;

      console.log(`  Downloaded JS Files (${downloadedFiles.length}):`);
      for (const f of downloadedFiles) {
        console.log(`    - ${f.fileName.padEnd(38)} raw: ${(f.rawSize / 1024).toFixed(2).padStart(7)} KB | gzip: ${(f.gzipSize / 1024).toFixed(2).padStart(6)} KB`);
      }

      console.log(`  Total Raw:  ${totalRawKb.toFixed(2)} KB`);
      console.log(`  Total Gzip: ${totalGzipKb.toFixed(2)} KB (Budget: ${BUDGET_KB} KB)`);

      // Check forbidden portal chunks
      const portalViolations = downloadedFiles.filter(f => {
        const lower = f.fileName.toLowerCase();
        return lower.includes('admin') ||
               lower.includes('rider') ||
               lower.includes('partner') ||
               lower.includes('butcher');
      });

      if (portalViolations.length > 0) {
        console.error(`  ❌ PORTAL ISOLATION VIOLATION on ${route}:`);
        portalViolations.forEach(v => console.error(`     - Downloaded internal portal chunk: ${v.fileName}`));
        anyFailed = true;
      }

      if (totalGzipBytes > BUDGET_BYTES) {
        console.error(`  ❌ BUDGET EXCEEDED on ${route}: ${totalGzipKb.toFixed(2)} KB > ${BUDGET_KB} KB`);
        anyFailed = true;
      }

      if (portalViolations.length === 0 && totalGzipBytes <= BUDGET_BYTES) {
        console.log(`  ✅ PASSED: ${route} (${totalGzipKb.toFixed(2)} KB gzipped, zero portal chunks)`);
      }

      await page.close();
    }

    if (anyFailed) {
      console.error('\n❌ Playwright bundle and portal isolation check FAILED.');
    } else {
      console.log('\n✅ ALL ROUTES PASSED: Portal isolation & <= 170 KB gzipped budget verified.');
    }
  } finally {
    if (browser) await browser.close();
    if (serverProc) {
      try {
        if (process.platform === 'win32') {
          execSync(`taskkill /pid ${serverProc.pid} /T /F`, { stdio: 'ignore' });
        } else {
          serverProc.kill('SIGTERM');
        }
      } catch {}
    }
    // Give OS socket a moment to release
    await new Promise(r => setTimeout(r, 500));
  }
  process.exit(anyFailed ? 1 : 0);
}

main().catch(err => {
  console.error('[Bundle Check Error]:', err);
  process.exit(1);
});
