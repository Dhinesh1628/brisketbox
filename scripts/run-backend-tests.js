import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'ci_test_fake_jwt_secret_32bytes_value_12345';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_ci_placeholder_key_id';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'ci_fake_razorpay_secret_placeholder';
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'ci_fake_webhook_secret_placeholder';
process.env.MONGOMS_VERSION = process.env.MONGOMS_VERSION || '7.0.14';

const localBinaryPath = 'C:\\Users\\dines\\.cache\\mongodb-binaries\\mongod-x64-win32-5.0.19.exe';
const systemBinary = process.env.MONGOMS_SYSTEM_BINARY || (fs.existsSync(localBinaryPath) ? localBinaryPath : undefined);

try {
  const backendRequire = createRequire(path.resolve('backend/server.js'));
  const { MongoMemoryServer } = backendRequire('mongodb-memory-server');
  console.log('[Backend Tests] Ensuring MongoDB binary is ready...');
  const prewarm = await MongoMemoryServer.create({
    binary: systemBinary ? { systemBinary } : { version: '7.0.14' }
  });
  await prewarm.stop();
  console.log('[Backend Tests] MongoDB binary is verified.');
} catch (e) {
  console.warn('[Backend Tests] MongoDB pre-warm notice:', e.message);
}

const testsDir = path.resolve('backend/tests');
const files = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.js'))
  .map(f => path.join('backend/tests', f));

console.log(`[Backend Tests] Running ${files.length} test suites with Node test runner...`);

const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], {
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  process.exit(code || 0);
});
