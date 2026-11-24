import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const publicImagesDir = path.resolve('frontend/public/images');
const productsDir = path.join(publicImagesDir, 'products');
const backupDir = path.resolve('frontend/image-originals-backup');

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}
if (!fs.existsSync(path.join(backupDir, 'products'))) {
  fs.mkdirSync(path.join(backupDir, 'products'), { recursive: true });
}

async function optimize() {
  console.log('[Images] Optimizing and converting all assets to WebP...');

  // 1. Optimize Hero and Brand Images in public/images
  const rootImages = fs.readdirSync(publicImagesDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  for (const file of rootImages) {
    const srcPath = path.join(publicImagesDir, file);
    const destName = file.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    const destPath = path.join(publicImagesDir, destName);

    const isHero = file.includes('hero');
    const width = isHero ? 1440 : 600;
    const quality = isHero ? 80 : 85;

    await sharp(srcPath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toFile(destPath);

    const stat = fs.statSync(destPath);
    console.log(` - Converted ${file} -> ${destName} (${(stat.size / 1024).toFixed(1)} KB)`);

    // Backup and remove original from public directory so it stays out of the build
    const backupPath = path.join(backupDir, file);
    fs.copyFileSync(srcPath, backupPath);
    fs.unlinkSync(srcPath);
  }

  // 2. Optimize Product and Dish Images in public/images/products
  const productImages = fs.readdirSync(productsDir).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
  for (const file of productImages) {
    const srcPath = path.join(productsDir, file);
    const destName = file.replace(/\.(jpg|jpeg|png)$/i, '.webp');
    const destPath = path.join(productsDir, destName);

    // Product card standard width: 800px max (2x for 400px displays), 78 quality
    await sharp(srcPath)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(destPath);

    const stat = fs.statSync(destPath);
    const kb = stat.size / 1024;
    console.log(` - Converted product ${file} -> ${destName} (${kb.toFixed(1)} KB)`);
    if (kb > 120) {
      console.warn(`[WARNING] Product image ${destName} exceeds 120 KB: ${kb.toFixed(1)} KB`);
    }

    // Backup and remove original from public directory so it stays out of the build
    const backupPath = path.join(backupDir, 'products', file);
    fs.copyFileSync(srcPath, backupPath);
    fs.unlinkSync(srcPath);
  }

  console.log('[Images] All images converted to WebP. Originals archived outside build.');
}

optimize().catch(err => {
  console.error('[Images Error]:', err);
  process.exit(1);
});
