import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const DIST_DIR = path.resolve('frontend/dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');
const BUDGET_KB = 170;
const BUDGET_BYTES = BUDGET_KB * 1024;

console.log('='.repeat(60));
console.log('  BRISKETBOX HOMEPAGE BUNDLE SIZE & ISOLATION CHECK');
console.log('='.repeat(60));

if (!fs.existsSync(INDEX_HTML)) {
  console.error(`❌ Build output not found at ${INDEX_HTML}. Run "npm --prefix frontend run build" first.`);
  process.exit(1);
}

const html = fs.readFileSync(INDEX_HTML, 'utf8');

// Find all entry scripts and modulepreloads in index.html
const scriptMatches = [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1]);
const preloadMatches = [...html.matchAll(/<link\s+rel="modulepreload"[^>]+href="([^"]+\.js)"/g)].map(m => m[1]);
const allInitialJs = Array.from(new Set([...scriptMatches, ...preloadMatches]));

console.log('\n📦 Initial Homepage JavaScript Resources:');

let totalRawBytes = 0;
let totalGzipBytes = 0;
let forbiddenChunks = [];

for (const relUrl of allInitialJs) {
  // Normalize path from /assets/xxx.js to frontend/dist/assets/xxx.js
  const cleanPath = relUrl.replace(/^\//, '');
  const filePath = path.join(DIST_DIR, cleanPath);

  if (!fs.existsSync(filePath)) {
    console.warn(`  ⚠️ Referenced file not found: ${filePath}`);
    continue;
  }

  const content = fs.readFileSync(filePath);
  const rawSize = content.length;
  const gzipped = zlib.gzipSync(content);
  const gzipSize = gzipped.length;

  totalRawBytes += rawSize;
  totalGzipBytes += gzipSize;

  const fileName = path.basename(filePath);
  console.log(`  - ${fileName.padEnd(40)} raw: ${(rawSize / 1024).toFixed(2).padStart(8)} KB | gzip: ${(gzipSize / 1024).toFixed(2).padStart(8)} KB`);

  // Verify portal isolation: admin, rider, partner, customer dashboard must never be loaded on homepage
  if (
    fileName.includes('page-admin') ||
    fileName.includes('page-rider') ||
    fileName.includes('page-partner') ||
    fileName.includes('page-customer-dashboard')
  ) {
    forbiddenChunks.push(fileName);
  }
}

const totalGzipKb = totalGzipBytes / 1024;
const totalRawKb = totalRawBytes / 1024;

console.log('\n📊 Summary:');
console.log(`  Total Homepage Raw Size:   ${totalRawKb.toFixed(2)} KB`);
console.log(`  Total Homepage Gzip Size:  ${totalGzipKb.toFixed(2)} KB`);
console.log(`  Performance Budget:        ${BUDGET_KB}.00 KB gzipped`);
console.log(`  Headroom / Remaining:      ${(BUDGET_KB - totalGzipKb).toFixed(2)} KB`);

if (forbiddenChunks.length > 0) {
  console.error(`\n❌ SECURITY & PERFORMANCE VIOLATION: Customer homepage is downloading internal portal chunks:`);
  forbiddenChunks.forEach(c => console.error(`   - ${c}`));
  console.error('Customers must NEVER download admin, rider, or partner code.');
  process.exit(1);
}

if (totalGzipBytes > BUDGET_BYTES) {
  console.error(`\n❌ BUNDLE BUDGET EXCEEDED: ${totalGzipKb.toFixed(2)} KB exceeds budget of ${BUDGET_KB} KB gzipped by ${(totalGzipKb - BUDGET_KB).toFixed(2)} KB`);
  process.exit(1);
}

console.log(`\n✅ PASSED: Homepage JS is ${totalGzipKb.toFixed(2)} KB gzipped (<= ${BUDGET_KB} KB budget). Portal isolation verified.`);
console.log('='.repeat(60));
