import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    if (item.name === 'node_modules' || item.name === '.git') continue;
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results = results.concat(getFiles(fullPath));
    } else if (item.name.endsWith('.js') || item.name.endsWith('.mjs')) {
      results.push(fullPath);
    }
  }
  return results;
}

const backendDir = path.resolve('backend');
const files = getFiles(backendDir);
console.log(`[Syntax Check] Verifying ${files.length} backend JavaScript files with node --check...`);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    console.error(`[Syntax Error] File failed syntax check: ${file}\n${err.message}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`[Syntax Check Failed] ${failed} file(s) failed syntax validation.`);
  process.exit(1);
}

console.log(`[Syntax Check Passed] All ${files.length} backend files verified successfully with node --check.`);
