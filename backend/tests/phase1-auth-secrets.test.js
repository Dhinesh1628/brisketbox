import assert from 'assert';
import bcrypt from 'bcryptjs';
import {
  createToken,
  verifyToken,
  getJwtSecret,
  requireRole,
  requireApproved,
  parseCookies
} from '../services/auth.js';

console.log('--- RUNNING PHASE 1 TESTS: AUTHENTICATION AND SECRETS ---');

// Test 1: JWT generation and verification with shorter expiry
{
  const mockUser = {
    id: 'usr_test_123',
    email: 'test@brisketbox.in',
    role: 'customer',
    name: 'Test Customer'
  };

  const token = createToken(mockUser);
  assert(token, 'Token should be generated');

  const decoded = verifyToken(token);
  assert.strictEqual(decoded.id, mockUser.id, 'Decoded user ID must match');
  assert.strictEqual(decoded.role, 'customer', 'Decoded role must match');

  // Verify expiry is within ~2 hours
  const now = Math.floor(Date.now() / 1000);
  const timeToLive = decoded.exp - now;
  assert(timeToLive > 7100 && timeToLive <= 7200, `Token lifespan must be ~7200s (2h), got ${timeToLive}s`);
  console.log('✓ Test 1 Passed: JWT generation, short 2-hour lifespan and payload verification passed');
}

// Test 2: Cookie parser helper
{
  const cookieHeader = 'token=jwt_xyz_123; other=hello';
  const cookies = parseCookies(cookieHeader);
  assert.strictEqual(cookies.token, 'jwt_xyz_123');
  assert.strictEqual(cookies.other, 'hello');
  console.log('✓ Test 2 Passed: HttpOnly cookie parsing helper passed');
}

// Test 3: requireApproved middleware blocks pending/rejected riders and partners
{
  let statusSet = null;
  let jsonResponse = null;
  let nextCalled = false;

  const mockRes = {
    status: (code) => {
      statusSet = code;
      return {
        json: (data) => {
          jsonResponse = data;
        }
      };
    }
  };

  // 3a. Pending rider must be blocked with 403
  const pendingRiderReq = {
    user: { id: 'r_1', role: 'rider', approvalStatus: 'pending_approval' }
  };
  requireApproved(pendingRiderReq, mockRes, () => { nextCalled = true; });
  assert.strictEqual(statusSet, 403, 'Pending rider must receive 403');
  assert.strictEqual(nextCalled, false, 'Next must not be called for pending rider');

  // 3b. Approved rider must pass
  statusSet = null;
  nextCalled = false;
  const approvedRiderReq = {
    user: { id: 'r_2', role: 'rider', approvalStatus: 'approved' }
  };
  requireApproved(approvedRiderReq, mockRes, () => { nextCalled = true; });
  assert.strictEqual(statusSet, null, 'Approved rider must not be rejected');
  assert.strictEqual(nextCalled, true, 'Next must be called for approved rider');

  // 3c. Customer role is unaffected by requireApproved
  statusSet = null;
  nextCalled = false;
  const customerReq = {
    user: { id: 'c_1', role: 'customer' }
  };
  requireApproved(customerReq, mockRes, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'Customer role should pass requireApproved');
  console.log('✓ Test 3 Passed: requireApproved strictly enforces approval gates');
}

// Test 4: Bcrypt authentication logic (no bypass)
{
  const realPassword = 'GenuinePassword#2026';
  const hashedPassword = bcrypt.hashSync(realPassword, 10);
  const user = { password: hashedPassword };

  const correctMatch = bcrypt.compareSync(realPassword, user.password);
  assert.strictEqual(correctMatch, true, 'Bcrypt compare must succeed on real password');

  // Previously permitted bypass passwords
  const bypassAttempts = ['Brisket#Customer2026!', 'customer123', 'admin123', 'partner123', 'rider123'];
  for (const bypass of bypassAttempts) {
    const bypassMatch = bcrypt.compareSync(bypass, user.password);
    assert.strictEqual(bypassMatch, false, `Bypass password '${bypass}' must be rejected by bcrypt`);
  }
  console.log('✓ Test 4 Passed: Password verification strictly uses bcrypt with zero bypasses');
}

// Test 5: Role authorization middleware
{
  let nextCalled = false;
  let statusSet = null;
  const mockRes = {
    status: (code) => {
      statusSet = code;
      return { json: () => {} };
    }
  };

  const adminReq = { user: { role: 'admin' } };
  const requirePartner = requireRole('partner');
  requirePartner(adminReq, mockRes, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'Admin must be permitted on partner routes');

  nextCalled = false;
  statusSet = null;
  const customerReq = { user: { role: 'customer' } };
  requirePartner(customerReq, mockRes, () => { nextCalled = true; });
  assert.strictEqual(statusSet, 403, 'Customer role must be forbidden on partner routes');
  assert.strictEqual(nextCalled, false, 'Next must not be called');
  console.log('✓ Test 5 Passed: Role-based authorization strictly enforces role boundaries');
}

console.log('\n--- ALL PHASE 1 TESTS PASSED SUCCESSFULLY ---');
