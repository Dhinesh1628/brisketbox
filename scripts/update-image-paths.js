import fs from 'node:fs';
import path from 'node:path';

const srcDir = path.resolve('frontend/src');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && /\.(tsx|ts|html|css)$/.test(entry.name)) {
      let content = fs.readFileSync(full, 'utf8');
      const original = content;

      // Replace /images/...jpg and /images/...png with .webp
      content = content.replace(/\/images\/([a-zA-Z0-9_\-\/]+)\.(jpg|jpeg|png)/g, '/images/$1.webp');

      if (content !== original) {
        fs.writeFileSync(full, content, 'utf8');
        console.log('Updated image paths in:', path.relative(srcDir, full));
      }
    }
  }
}

walk(srcDir);
console.log('Finished updating frontend image paths to .webp!');
