import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ci_test_fake_jwt_secret_32bytes_value_12345';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_ci_placeholder_key_id';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'ci_fake_razorpay_secret_placeholder';
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'ci_fake_webhook_secret_placeholder';

const testsDir = path.resolve('backend/tests');
const files = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .map(f => path.join('backend/tests', f));

console.log(`[Backend Tests] Running ${files.length} test suites with Node test runner...`);

const child = spawn(process.execPath, ['--test', ...files], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code || 0);
});
