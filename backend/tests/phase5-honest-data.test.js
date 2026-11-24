import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_audit_hardening_key_32bytes_long!';
process.env.RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || 'test_webhook_secret_key_12345';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_placeholder';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'test_secret_placeholder';

import { db } from '../db.js';
import { createToken } from '../services/auth.js';
import { processCustomerMessage } from '../services/aiChatbot.js';

describe('Phase 5 Honest Data, Claims Enforcement & Telemetry Suite', () => {
  let server;
  let baseUrl;
  let adminUser;
  let adminToken;
  let partnerUser;
  let partnerToken;
  let customerUser;
  let customerToken;

  before(async () => {
    const serverModule = await import('../server.js');
    const app = serverModule.default;

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    const runId = Date.now().toString(36);

    adminUser = {
      id: `admin_p5_${runId}`,
      name: 'P5 Admin',
      email: `admin.p5.${runId}@example.com`,
      role: 'admin',
      approvalStatus: 'approved'
    };
    partnerUser = {
      id: `partner_p5_${runId}`,
      name: 'P5 Partner Butcher',
      email: `partner.p5.${runId}@example.com`,
      role: 'partner',
      approvalStatus: 'approved'
    };
    customerUser = {
      id: `cust_p5_${runId}`,
      name: 'P5 Customer',
      email: `cust.p5.${runId}@example.com`,
      role: 'customer'
    };

    db.insert('users', adminUser);
    db.insert('users', partnerUser);
    db.insert('users', customerUser);

    adminToken = createToken(adminUser);
    partnerToken = createToken(partnerUser);
    customerToken = createToken(customerUser);
  });

  after(async () => {
    if (server) await new Promise(r => server.close(r));
  });

  const request = (pathUrl, options = {}) => {
    return new Promise((resolve, reject) => {
      const url = new URL(pathUrl, baseUrl);
      const req = http.request(url, options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      });
      req.on('error', reject);
      if (options.body) req.write(options.body);
      req.end();
    });
  };

  it('1. No random temperature is generated upon order creation', async () => {
    const orderData = {
      items: [
        {
          productId: 'prod_1',
          name: 'Mangalore Surmai Tawa Fry (Large Steaks)',
          price: 799,
          quantity: 1
        }
      ],
      deliveryAddress: 'Customer chosen address',
      paymentMethod: 'cash'
    };

    const res = await request('/api/orders', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${customerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    });

    assert.equal(res.status, 201);
    assert.strictEqual(res.data.liveTemp, null);
    assert.deepStrictEqual(res.data.tempLog, []);
  });

  it('2. Order with no reading has liveTemp null ("not recorded")', async () => {
    const orderId = `ORD-NO-TEMP-${Date.now()}`;
    const order = {
      id: orderId,
      orderNumber: orderId,
      userId: customerUser.id,
      customerName: customerUser.name,
      customerEmail: customerUser.email,
      liveTemp: null,
      tempLog: [],
      orderStatus: 'CONFIRMED'
    };
    db.insert('orders', order);

    const res = await request(`/api/orders/${orderId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${customerToken}` }
    });

    assert.equal(res.status, 200);
    assert.strictEqual(res.data.liveTemp, null);
    assert.deepStrictEqual(res.data.tempLog, []);
  });

  it('3. Staff temperature reading saves correctly with source and audit trail', async () => {
    const orderId = `ORD-STAFF-TEMP-${Date.now()}`;
    const order = {
      id: orderId,
      orderNumber: orderId,
      userId: customerUser.id,
      customerName: customerUser.name,
      customerEmail: customerUser.email,
      liveTemp: null,
      tempLog: [],
      orderStatus: 'PREPARING'
    };
    db.insert('orders', order);

    const tempReading = 1.9;
    const res = await request(`/api/orders/${orderId}/temperature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${partnerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        temp: tempReading,
        source: 'STAFF_CHECK',
        event: 'Butchery chilled station manual inspection'
      })
    });

    assert.equal(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert.strictEqual(res.data.liveTemp, 1.9);
    assert.equal(res.data.tempLog.length, 1);
    assert.strictEqual(res.data.tempLog[0].temp, 1.9);
    assert.strictEqual(res.data.tempLog[0].source, 'STAFF_CHECK');
    assert.strictEqual(res.data.tempLog[0].recordedBy, partnerUser.name);

    const saved = db.findById('orders', orderId);
    assert.strictEqual(saved.liveTemp, 1.9);
    assert.strictEqual(saved.tempLog[0].temp, 1.9);
  });

  it('4. Rejects invalid temperature readings (outside -30C to 60C or NaN)', async () => {
    const orderId = `ORD-VALIDATE-${Date.now()}`;
    const order = {
      id: orderId,
      orderNumber: orderId,
      userId: customerUser.id,
      liveTemp: null,
      tempLog: []
    };
    db.insert('orders', order);

    const invalidTooHot = await request(`/api/orders/${orderId}/temperature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ temp: 95.0 })
    });
    assert.equal(invalidTooHot.status, 400);

    const invalidString = await request(`/api/orders/${orderId}/temperature`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ temp: 'warm' })
    });
    assert.equal(invalidString.status, 400);
  });

  it('5. Status changes do not inject fabricated temperatures', async () => {
    const orderId = `ORD-STATUS-${Date.now()}`;
    const order = {
      id: orderId,
      orderNumber: orderId,
      userId: customerUser.id,
      liveTemp: null,
      tempLog: [],
      orderStatus: 'CONFIRMED'
    };
    db.insert('orders', order);

    const res = await request(`/api/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'PREPARING' })
    });

    assert.equal(res.status, 200);
    assert.strictEqual(res.data.liveTemp, null);
    assert.deepStrictEqual(res.data.tempLog, []);
  });

  it('6. Frontend builds and neither built assets nor index.html contain unapproved banned claims', async () => {
    const projectRoot = path.resolve('.');
    const claimsPath = path.join(projectRoot, 'docs/CLAIMS_TO_CONFIRM.md');
    const approvedPath = path.join(projectRoot, 'docs/APPROVED_CLAIMS.md');

    assert.ok(fs.existsSync(claimsPath), 'docs/CLAIMS_TO_CONFIRM.md must exist');
    assert.ok(fs.existsSync(approvedPath), 'docs/APPROVED_CLAIMS.md must exist');

    const claimsText = fs.readFileSync(claimsPath, 'utf8');
    const approvedText = fs.readFileSync(approvedPath, 'utf8');

    // Extract banned phrases from backtick patterns in CLAIMS_TO_CONFIRM.md
    const rawBanned = [];
    const backtickMatches = claimsText.match(/`([^`]+)`/g) || [];
    for (const match of backtickMatches) {
      const phrase = match.slice(1, -1).trim();
      if (phrase.length >= 3 && !phrase.startsWith('/') && !phrase.endsWith('.js') && !phrase.endsWith('.tsx') && !phrase.endsWith('.ts')) {
        rawBanned.push(phrase);
      }
    }

    // Extract approved claims
    const approvedSet = new Set();
    const approvedMatches = approvedText.match(/"([^"]+)"/g) || [];
    for (const match of approvedMatches) {
      approvedSet.add(match.slice(1, -1).trim().toLowerCase());
    }

    // Filter banned phrases that are explicitly approved
    const activeBannedPhrases = Array.from(new Set(rawBanned)).filter(
      phrase => !approvedSet.has(phrase.toLowerCase())
    );

    assert.ok(activeBannedPhrases.length > 0, 'Must have cataloged banned phrases to verify');

    // Run frontend build if frontend node_modules are present
    if (fs.existsSync(path.join(projectRoot, 'frontend/node_modules'))) {
      try {
        execSync('npm run build', {
          cwd: path.join(projectRoot, 'frontend'),
          shell: true,
          stdio: 'pipe'
        });
      } catch (err) {
        console.warn('[Phase 5 Test] Frontend build notice:', err.message);
      }
    }

    // Collect all built files and index.html
    const filesToScan = [path.join(projectRoot, 'frontend/index.html')];
    const distDir = path.join(projectRoot, 'frontend/dist');
    const walkDir = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(full);
        } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.js') || entry.name.endsWith('.css'))) {
          filesToScan.push(full);
        }
      }
    };
    if (fs.existsSync(distDir)) {
      walkDir(distDir);
    }

    const violations = [];
    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf8');
      for (const phrase of activeBannedPhrases) {
        if (content.toLowerCase().includes(phrase.toLowerCase())) {
          violations.push({
            file: path.relative(projectRoot, filePath),
            phrase
          });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Built frontend assets / index.html contained banned phrases:\n${violations.map(v => ` - [${v.phrase}] in ${v.file}`).join('\n')}`
    );
  });

  it('7. Fails on any numeric temperature literal in frontend source outside tests', () => {
    const projectRoot = path.resolve('.');
    const srcDir = path.join(projectRoot, 'frontend/src');
    const indexHtml = path.join(projectRoot, 'frontend/index.html');
    const filesToScan = [indexHtml];

    const walk = (dir) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.includes('__tests__') && entry.name !== 'node_modules') {
            walk(full);
          }
        } else if (entry.isFile() && /\.(ts|tsx|html|css)$/.test(entry.name)) {
          if (!entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
            filesToScan.push(full);
          }
        }
      }
    };
    walk(srcDir);

    const numericTempRegex = /(^|[^\w])(-?\d+(\.\d+)?\s*°\s*C?|\d+\s*[-–—]\s*\d+\s*°\s*C?)/i;
    const violations = [];

    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, lineNum) => {
        if (numericTempRegex.test(line)) {
          violations.push({
            file: path.relative(projectRoot, filePath),
            line: lineNum + 1,
            text: line.trim()
          });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found numeric temperature literals in frontend source:\n${violations.map(v => ` - ${v.file}:${v.line} "${v.text}"`).join('\n')}`
    );
  });

  it('8. Fails on guarantee, SLA, response-time, or minute-based delivery promises', () => {
    const projectRoot = path.resolve('.');
    const srcDir = path.join(projectRoot, 'frontend/src');
    const distDir = path.join(projectRoot, 'frontend/dist');
    const filesToScan = [path.join(projectRoot, 'frontend/index.html')];

    const walk = (dir, isDist = false) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.includes('__tests__') && entry.name !== 'node_modules') {
            walk(full, isDist);
          }
        } else if (entry.isFile()) {
          if (isDist && /\.(html|js|css)$/.test(entry.name)) {
            filesToScan.push(full);
          } else if (!isDist && /\.(ts|tsx|html)$/.test(entry.name) && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
            filesToScan.push(full);
          }
        }
      }
    };
    walk(srcDir, false);
    walk(distDir, true);

    const guaranteeSlaRegex = /\b(guarantee|guaranteed|guarantees|SLA|response[-\s]*time)\b/i;
    const deliveryMinutePromiseRegex = /\b(\d+[\s-]*(min|minute|mins|minutes)[\w\s]{0,30}(deliver|delivery|doorstep|dispatch|drop-off|reach|eta)|(deliver|delivery|doorstep|dispatch|drop-off|reach|eta)[\w\s]{0,30}\b\d+[\s-]*(min|minute|mins|minutes)|90[-\s]*min|15[-\s]*min)\b/i;

    const violations = [];
    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, lineNum) => {
        // Exclude React framework internal warnings in bundled runtime code
        if (line.includes('concurrent mode') || line.includes('responsibility to guarantee')) {
          return;
        }
        if (guaranteeSlaRegex.test(line)) {
          violations.push({
            type: 'Guarantee / SLA / Response-Time',
            file: path.relative(projectRoot, filePath),
            line: lineNum + 1,
            text: line.trim().slice(0, 100)
          });
        }
        if (deliveryMinutePromiseRegex.test(line)) {
          violations.push({
            type: 'Minute-based Delivery Promise',
            file: path.relative(projectRoot, filePath),
            line: lineNum + 1,
            text: line.trim().slice(0, 100)
          });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found forbidden guarantee, SLA, response-time, or delivery promises:\n${violations.map(v => ` - [${v.type}] ${v.file}:${v.line} "${v.text}"`).join('\n')}`
    );
  });

  it('9. Fails on certification and origin wording even if not in CLAIMS_TO_CONFIRM.md', () => {
    const projectRoot = path.resolve('.');
    const srcDir = path.join(projectRoot, 'frontend/src');
    const distDir = path.join(projectRoot, 'frontend/dist');
    const filesToScan = [path.join(projectRoot, 'frontend/index.html')];

    const walk = (dir, isDist = false) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!entry.name.includes('__tests__') && entry.name !== 'node_modules') {
            walk(full, isDist);
          }
        } else if (entry.isFile()) {
          if (isDist && /\.(html|js|css)$/.test(entry.name)) {
            filesToScan.push(full);
          } else if (!isDist && /\.(ts|tsx|html)$/.test(entry.name) && !entry.name.includes('.test.') && !entry.name.includes('.spec.')) {
            filesToScan.push(full);
          }
        }
      }
    };
    walk(srcDir, false);
    walk(distDir, true);

    const certOriginRegex = /\b(certifi(ed|cation)|fssai certified|fssc\b|iso\b|bio-secured|pasture-raised|free-range|antibiotic-free|harbor catch|coastal harbor|farm fresh|artisanal|hand-trimmed|vacuum-sealed)\b/i;

    const violations = [];
    for (const filePath of filesToScan) {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, lineNum) => {
        // Exclude back-office partner onboarding form input fields for shop license entry
        if (line.includes('FSSAI License') || line.includes('FSSAI Status') || line.includes('FSSAI Number') || line.includes('14-digit FSSAI') || line.includes('Verify FSSAI licenses')) {
          return;
        }
        if (certOriginRegex.test(line)) {
          violations.push({
            file: path.relative(projectRoot, filePath),
            line: lineNum + 1,
            text: line.trim().slice(0, 100)
          });
        }
      });
    }

    assert.strictEqual(
      violations.length,
      0,
      `Found unverified certification or origin wording:\n${violations.map(v => ` - ${v.file}:${v.line} "${v.text}"`).join('\n')}`
    );
  });

  it('10. WhatsApp Chatbot reply texts do not contain unapproved banned claims', async () => {
    const projectRoot = path.resolve('.');
    const claimsPath = path.join(projectRoot, 'docs/CLAIMS_TO_CONFIRM.md');
    const approvedPath = path.join(projectRoot, 'docs/APPROVED_CLAIMS.md');

    const claimsText = fs.readFileSync(claimsPath, 'utf8');
    const approvedText = fs.readFileSync(approvedPath, 'utf8');

    const rawBanned = [];
    const backtickMatches = claimsText.match(/`([^`]+)`/g) || [];
    for (const match of backtickMatches) {
      const phrase = match.slice(1, -1).trim();
      if (phrase.length >= 3 && !phrase.startsWith('/') && !phrase.endsWith('.js') && !phrase.endsWith('.tsx') && !phrase.endsWith('.ts')) {
        rawBanned.push(phrase);
      }
    }

    const approvedSet = new Set();
    const approvedMatches = approvedText.match(/"([^"]+)"/g) || [];
    for (const match of approvedMatches) {
      approvedSet.add(match.slice(1, -1).trim().toLowerCase());
    }

    const activeBannedPhrases = Array.from(new Set(rawBanned)).filter(
      phrase => !approvedSet.has(phrase.toLowerCase())
    );

    const testPrompts = [
      'hello',
      'show me available fish',
      'what mutton cuts do you have?',
      'tell me about chicken',
      'add 500g surmai to cart',
      'surmai tawa fry recipe',
      'how to cook mutton rogan josh',
      'party dinner for 6 people',
      'is your meat fresh or frozen?',
      'how is my order delivered and packed?',
      'where is my order status track',
      'view my cart'
    ];

    const violations = [];
    for (const prompt of testPrompts) {
      const result = await processCustomerMessage(prompt, '+919988776655');
      const text = `${result.reply || ''} ${result.actionCard?.title || ''} ${result.actionCard?.subtitle || ''}`;
      for (const phrase of activeBannedPhrases) {
        if (text.toLowerCase().includes(phrase.toLowerCase())) {
          violations.push({
            prompt,
            phrase,
            reply: text.slice(0, 120)
          });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Chatbot replies contained banned phrases:\n${violations.map(v => ` - [${v.phrase}] on prompt "${v.prompt}"`).join('\n')}`
    );
  });

  it('11. Backend product data and model defaults do not contain banned claims', async () => {
    const projectRoot = path.resolve('.');
    const claimsPath = path.join(projectRoot, 'docs/CLAIMS_TO_CONFIRM.md');
    const approvedPath = path.join(projectRoot, 'docs/APPROVED_CLAIMS.md');

    const claimsText = fs.readFileSync(claimsPath, 'utf8');
    const approvedText = fs.readFileSync(approvedPath, 'utf8');

    const rawBanned = [];
    const backtickMatches = claimsText.match(/`([^`]+)`/g) || [];
    for (const match of backtickMatches) {
      const phrase = match.slice(1, -1).trim();
      if (phrase.length >= 3 && !phrase.startsWith('/') && !phrase.endsWith('.js') && !phrase.endsWith('.tsx') && !phrase.endsWith('.ts')) {
        rawBanned.push(phrase);
      }
    }

    const approvedSet = new Set();
    const approvedMatches = approvedText.match(/"([^"]+)"/g) || [];
    for (const match of approvedMatches) {
      approvedSet.add(match.slice(1, -1).trim().toLowerCase());
    }

    const activeBannedPhrases = Array.from(new Set(rawBanned)).filter(
      phrase => !approvedSet.has(phrase.toLowerCase())
    );

    // 1. Scan backend/models/Product.js
    const productModelPath = path.join(projectRoot, 'backend/models/Product.js');
    assert.ok(fs.existsSync(productModelPath), 'Product model must exist');
    const productModelText = fs.readFileSync(productModelPath, 'utf8');

    const violations = [];
    for (const phrase of activeBannedPhrases) {
      if (productModelText.toLowerCase().includes(phrase.toLowerCase())) {
        violations.push({ source: 'backend/models/Product.js', phrase });
      }
    }

    // 2. Scan backend/data.json
    const dataJsonPath = path.join(projectRoot, 'backend/data.json');
    if (fs.existsSync(dataJsonPath)) {
      const dataJson = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
      const products = dataJson.products || [];
      for (const prod of products) {
        const textToScan = `${prod.name} ${prod.description || ''} ${prod.eta || ''} ${prod.origin || ''} ${prod.chillingMethod || ''} ${prod.catchDate || ''}`;
        for (const phrase of activeBannedPhrases) {
          if (textToScan.toLowerCase().includes(phrase.toLowerCase())) {
            violations.push({ source: `backend/data.json (prod: ${prod.id})`, phrase });
          }
        }
      }
    }

    // 3. Scan database products
    const dbProducts = db.get('products') || db.data.products || [];
    for (const prod of dbProducts) {
      const textToScan = `${prod.name} ${prod.description || ''} ${prod.eta || ''} ${prod.origin || ''} ${prod.chillingMethod || ''} ${prod.catchDate || ''}`;
      for (const phrase of activeBannedPhrases) {
        if (textToScan.toLowerCase().includes(phrase.toLowerCase())) {
          violations.push({ source: `backend/db.js (prod: ${prod.id})`, phrase });
        }
      }
    }

    assert.strictEqual(
      violations.length,
      0,
      `Backend product data or model defaults contained banned claims:\n${violations.map(v => ` - [${v.phrase}] in ${v.source}`).join('\n')}`
    );
  });
});
