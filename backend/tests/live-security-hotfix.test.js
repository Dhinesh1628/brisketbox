import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { db } from '../db.js';
import { validateProductionEnv, getJwtSecret } from '../services/auth.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_audit_hardening_key_32bytes_long!';

let server;
let baseUrl;

function makeToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function extractApiRoutes(app) {
  const routes = [];
  function traverse(stack, prefix = '') {
    for (const layer of stack) {
      if (layer.route) {
        const rawPath = prefix + (layer.route.path === '/' && prefix ? '' : layer.route.path);
        const cleanPath = rawPath.replace(/\/\?\(\?=\/\|\$\)/g, '').replace(/\/\?$/g, '');
        const methods = Object.keys(layer.route.methods).filter(m => layer.route.methods[m]);
        for (const method of methods) {
          routes.push({ method: method.toUpperCase(), path: cleanPath });
        }
      } else if (layer.name === 'router' && layer.handle?.stack) {
        let routerPrefix = prefix;
        if (layer.regexp) {
          const match = layer.regexp.source
            .replace(/\\\//g, '/')
            .replace(/\^/g, '')
            .replace(/\$\/?/g, '')
            .replace(/\(\?=\\\/\|\$\)/g, '')
            .replace(/\/?\(\?=\/\|\$\)/g, '')
            .replace(/\\/g, '');
          routerPrefix = prefix + match;
        }
        traverse(layer.handle.stack, routerPrefix);
      }
    }
  }
  traverse(app._router.stack);
  return routes.filter(r => r.path.startsWith('/api'));
}

describe('Live Security Hotfix & Access Control Suite', () => {
  let customerUser;
  let adminUser;
  let customerToken;
  let adminToken;
  let app;

  before(async () => {
    const serverModule = await import('../server.js');
    app = serverModule.default;

    await new Promise((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    customerUser = {
      id: `usr_cust_sec_test_${Date.now()}`,
      name: 'Customer Sec Test',
      email: `cust.sec.${Date.now()}@example.com`,
      role: 'customer',
      approvalStatus: 'approved'
    };
    adminUser = {
      id: `usr_admin_sec_test_${Date.now()}`,
      name: 'Admin Sec Test',
      email: `admin.sec.${Date.now()}@example.com`,
      role: 'admin',
      approvalStatus: 'approved'
    };

    db.insert('users', customerUser);
    db.insert('users', adminUser);

    customerToken = makeToken(customerUser);
    adminToken = makeToken(adminUser);
  });

  after(async () => {
    try {
      if (customerUser) db.delete('users', customerUser.id);
      if (adminUser) db.delete('users', adminUser.id);
    } catch {}
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
  });

  describe('1. Analytics Endpoints Security (/api/analytics/*)', () => {
    it('returns 401 Unauthorized when accessing /api/analytics/overview without login', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/overview`);
      assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
      const body = await res.json();
      assert.ok(body.error, 'Must return error message');
    });

    it('returns 401 Unauthorized when accessing /api/analytics/rider-report without login', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/rider-report`);
      assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
    });

    it('returns 401 Unauthorized when accessing /api/analytics/demand-check without login', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/demand-check`);
      assert.strictEqual(res.status, 401, 'Unauthenticated request must return 401');
    });

    it('returns 403 Forbidden when accessing /api/analytics/overview as a non-admin (customer)', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/overview`, {
        headers: { 'Authorization': `Bearer ${customerToken}` }
      });
      assert.strictEqual(res.status, 403, 'Non-admin request must return 403 Forbidden');
      const body = await res.json();
      assert.match(body.error, /admin|permission|forbidden|access/i, 'Error message must indicate forbidden access');
    });

    it('returns 403 Forbidden when accessing /api/analytics/rider-report as a non-admin (customer)', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/rider-report`, {
        headers: { 'Authorization': `Bearer ${customerToken}` }
      });
      assert.strictEqual(res.status, 403, 'Non-admin request must return 403 Forbidden');
    });

    it('allows admin access to /api/analytics/overview with 200 OK', async () => {
      const res = await fetch(`${baseUrl}/api/analytics/overview`, {
        headers: { 'Authorization': `Bearer ${adminToken}` }
      });
      assert.strictEqual(res.status, 200, 'Admin request must return 200 OK');
      const body = await res.json();
      assert.ok(body !== null && typeof body === 'object', 'Admin must receive analytics data');
    });
  });

  describe('2. Production Startup Strict Fail-Safe Without Secrets', () => {
    it('validateProductionEnv throws when NODE_ENV is production and JWT_SECRET is missing', () => {
      const origEnv = process.env.NODE_ENV;
      const origJwt = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;
        assert.throws(
          () => validateProductionEnv(),
          /Production startup failed: missing required environment variables/i,
          'validateProductionEnv must throw in production without JWT_SECRET'
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.JWT_SECRET = origJwt;
      }
    });

    it('getJwtSecret throws in production when JWT_SECRET is missing or empty', () => {
      const origEnv = process.env.NODE_ENV;
      const origJwt = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;
        assert.throws(
          () => getJwtSecret(),
          /JWT_SECRET must be configured in production environment/i,
          'getJwtSecret must throw in production without JWT_SECRET'
        );
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.JWT_SECRET = origJwt;
      }
    });

    it('production server startup script exits with failure code when JWT_SECRET is missing', () => {
      const code = `
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;
        import('./backend/server.js').catch(err => {
          console.error(err.message);
          process.exit(1);
        });
      `;
      const child = spawnSync(process.execPath, ['-e', code], {
        cwd: process.cwd(),
        encoding: 'utf8'
      });
      assert.notStrictEqual(child.status, 0, 'Server startup in production must fail when JWT_SECRET is unset');
    });
  });

  describe('3. Automated Exhaustive /api Route Authentication Scanner', () => {
    // Explicit public routes list (health, public products, auth login/registration, webhooks)
    const publicWhitelist = new Set([
      'GET /api/health',
      'GET /api/db/status',
      'GET /api/stats',
      'GET /api',
      'GET /api/products',
      'GET /api/products/:id',
      'POST /api/auth/register',
      'POST /api/auth/login',
      'POST /api/auth/logout',
      'POST /api/auth/google',
      'POST /api/rider/register',
      'POST /api/rider/login',
      'POST /api/partner/register',
      'POST /api/partner/login',
      'POST /api/payments/webhook',
      'GET /api/whatsapp/webhook/whatsapp',
      'POST /api/whatsapp/webhook/whatsapp',
      'POST /api/whatsapp/chatbot/chat',
      'POST /api/contact',
      'POST /api/iot/coldchain-ping'
    ]);

    it('fails if any route other than the explicit public list works without login', async () => {
      const routes = extractApiRoutes(app);
      assert.ok(routes.length > 20, `Expected at least 20 /api routes, found ${routes.length}`);

      const unauthenticatedLeakingRoutes = [];

      for (const route of routes) {
        const routeKey = `${route.method} ${route.path}`;
        if (publicWhitelist.has(routeKey)) {
          continue; // Allowed public route
        }

        // Replace any URL parameters (:id, :qr, etc.) with dummy test identifiers
        const testPath = route.path.replace(/:[a-zA-Z0-9_]+/g, 'test_param');
        
        try {
          const res = await fetch(`${baseUrl}${testPath}`, {
            method: route.method,
            headers: { 'Content-Type': 'application/json' }
          });

          // Any non-public route responding with 200, 201, or 204 without login is a security leak
          if (res.status >= 200 && res.status < 300) {
            unauthenticatedLeakingRoutes.push({
              route: routeKey,
              testedPath: testPath,
              status: res.status
            });
          }
        } catch (err) {
          // Connection errors or aborts do not represent successful access
        }
      }

      assert.strictEqual(
        unauthenticatedLeakingRoutes.length,
        0,
        `Found non-public route(s) accessible without login: ${JSON.stringify(unauthenticatedLeakingRoutes, null, 2)}`
      );
    });
  });
});
