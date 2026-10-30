import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/auth_unit_test';
process.env.JWT_SECRET = 'unit-test-only-secret-at-least-32-characters';
process.env.NODE_ENV = 'test';
process.env.JWT_TTL_SECONDS = '3600';
const { default: jwt } = await import('jsonwebtoken');
const { issueToken, verifyToken, tokenOptions } = await import('../src/services/tokenService.js');
const { validateAdminSeed } = await import('../src/services/adminSeedService.js');
const subject = '012345678901234567890123';
const sign = (claims = {}, options = {}) => jwt.sign(claims, process.env.JWT_SECRET, { ...tokenOptions, subject, expiresIn: '1h', ...options });

test('issued tokens have scoped claims and contain no profile or hash', () => {
  const token = issueToken({ _id: subject, password: 'must-not-leak', email: 'private@campus.edu', role: 'admin' });
  const claims = verifyToken(token);
  assert.equal(claims.sub, subject);
  assert.equal(claims.exp - claims.iat, 3600);
  assert.equal(claims.password, undefined);
  assert.equal(claims.email, undefined);
  assert.equal(claims.role, undefined);
});
test('expired tokens are rejected without waiting for a timer', () => {
  assert.throws(() => verifyToken(sign({}, { expiresIn: -1 })), { status: 401 });
});
test('rejects forged signatures, incorrect scope, algorithms and malformed subjects', () => {
  const forged = jwt.sign({}, 'different-secret-of-more-than-32-characters', { ...tokenOptions, subject, expiresIn: '1h' });
  for (const token of [forged, 'malformed', sign({}, { issuer: 'another-app' }), sign({}, { audience: 'another-client' }), sign({}, { algorithm: 'HS384' }), sign({}, { subject: 'bad-id' })]) {
    assert.throws(() => verifyToken(token), { status: 401 });
  }
});
test('rejects signed tokens without explicit expiration', () => {
  const token = jwt.sign({}, process.env.JWT_SECRET, { ...tokenOptions, subject });
  assert.throws(() => verifyToken(token), { status: 401 });
});
test('development seed rejects production, missing credentials and example passwords', () => {
  const input = { NODE_ENV: 'development', SEED_ADMIN_EMAIL: 'admin@campus.edu', SEED_ADMIN_PASSWORD: 'unique-password-for-tests' };
  assert.equal(validateAdminSeed(input).email, input.SEED_ADMIN_EMAIL);
  assert.throws(() => validateAdminSeed({ ...input, NODE_ENV: 'production' }));
  assert.throws(() => validateAdminSeed({ ...input, SEED_ADMIN_EMAIL: undefined }));
  assert.throws(() => validateAdminSeed({ ...input, SEED_ADMIN_PASSWORD: 'change-this-before-seeding' }));
});
