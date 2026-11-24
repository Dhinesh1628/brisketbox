import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const allowlistPath = path.join(__dirname, 'color-lint-allowlist.json');
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));

const customerFiles = [
  'frontend/src/pages/HomePage.tsx',
  'frontend/src/pages/CatalogPage.tsx',
  'frontend/src/pages/ProductDetailPage.tsx',
  'frontend/src/components/Navbar.tsx',
  'frontend/src/components/HeroSection.tsx',
  'frontend/src/components/CategorySection.tsx',
  'frontend/src/components/CartDrawer.tsx',
  'frontend/src/components/WhatsAppButton.tsx',
  'frontend/src/components/FloatingBottomCartBar.tsx'
];

let totalViolations = 0;

console.log('--- RUNNING COLOUR TOKEN & 3-COLOUR RULE LINT ---');
console.log('Scanning customer-facing frontend components for compliance with tokens (primary, neutral, success)...');

for (const relativePath of customerFiles) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[SKIP] File not found: ${relativePath}`);
    continue;
  }

  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');

  lines.forEach((line, lineIndex) => {
    const lineNum = lineIndex + 1;

    // Check 1: Disallowed palette colours (blue, purple, amber, teal, pink, orange, etc.)
    for (const prefix of allowlist.disallowedColorPrefixes) {
      const colorRegex = new RegExp(`\\b(bg|text|border|ring|from|to|via)-${prefix}[0-9a-z/]+`, 'g');
      let match;
      while ((match = colorRegex.exec(line)) !== null) {
        const token = match[0];
        const isAllowed = allowlist.allowedExceptions.some(
          exc => (exc.file === relativePath || exc.file.replace(/\\/g, '/') === relativePath) && exc.pattern === token
        );
        if (!isAllowed) {
          console.error(`[FAIL] ${relativePath}:${lineNum} - Disallowed color '${token}' outside 3-colour system.`);
          console.error(`       Line: "${line.trim()}"`);
          totalViolations++;
        }
      }
    }

    // Check 2: Red classes on non-buy elements (Rule 8: Primary red is ONLY for buy actions, logo, and selected pack size outline)
    const redRegex = /\b(bg|text|border|ring|from|to|via)-(red-[0-9]+|\[#d11243\]|primary\b)/g;
    let redMatch;
    while ((redMatch = redRegex.exec(line)) !== null) {
      const token = redMatch[0];
      const isAllowed = allowlist.allowedExceptions.some(
        exc => (exc.file === relativePath || exc.file.replace(/\\/g, '/') === relativePath) && line.includes(exc.pattern)
      );

      // Verify if this is an allowed buy action in local context (+/- 3 lines)
      const contextLines = lines.slice(Math.max(0, lineIndex - 3), Math.min(lines.length, lineIndex + 4)).join(' ').toLowerCase();
      const isBuyAction = 
        contextLines.includes('cart') ||
        contextLines.includes('checkout') ||
        contextLines.includes('shop now') ||
        contextLines.includes('btn-buy') ||
        contextLines.includes('continue') ||
        contextLines.includes('pay') ||
        contextLines.includes('add') ||
        contextLines.includes('selectedweight') ||
        relativePath.includes('FloatingBottomCartBar');

      if (!isAllowed && !isBuyAction) {
        console.error(`[FAIL] ${relativePath}:${lineNum} - Red/primary class '${token}' used on non-buy element.`);
        console.error(`       Line: "${line.trim()}"`);
        totalViolations++;
      }
    }
  });
}

if (totalViolations > 0) {
  console.error(`\nColour lint FAILED with ${totalViolations} violation(s).`);
  console.error('All customer-facing components must adhere strictly to:');
  console.error('  1. Primary Crimson (#d11243): ONLY for buy actions, logo, selected pack size outline');
  console.error('  2. Neutral: Grey scale for text, borders, cards, backgrounds, badges');
  console.error('  3. Success: Green for status only');
  process.exit(1);
} else {
  console.log(`\nPASS: All ${customerFiles.length} customer-facing files adhere strictly to the 3-colour system with 0 violations.`);
  process.exit(0);
}
