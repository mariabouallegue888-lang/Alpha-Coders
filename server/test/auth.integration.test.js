import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('authentication HTTP API with real MongoDB', { skip: !process.env.MONGODB_TEST_URI }, async t => {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.JWT_SECRET = 'auth-integration-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  const { default: mongoose } = await import('mongoose');
  const { default: bcrypt } = await import('bcrypt');
  const { default: jwt } = await import('jsonwebtoken');
  const { app } = await import('../src/app.js');
  const { User } = await import('../src/models/User.js');
  const { tokenOptions } = await import('../src/services/tokenService.js');
  const { seedAdmin } = await import('../src/services/adminSeedService.js');
  const database = `campus_auth_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const account = { name: 'Auth Student', email: 'student@campus.edu', password: 'unique-student-password' };
  let session;
  async function request(path, method = 'GET', body, token) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  }
  try {
    await User.init();
    await t.test('registration validates input, hashes password and refuses public admin assignment', async () => {
      assert.equal((await request('/auth/register', 'POST', { name: 'A', email: 'invalid', password: 'short' })).status, 400);
      const result = await request('/auth/register', 'POST', { ...account, role: 'admin' });
      assert.equal(result.status, 201);
      assert.equal(result.headers.get('cache-control'), 'no-store');
      assert.equal(result.data.user.role, 'user');
      assert.equal(result.data.user.password, undefined);
      assert.deepEqual(Object.keys(result.data.user).sort(), ['_id', 'createdAt', 'email', 'name', 'role']);
      const stored = await User.findById(result.data.user._id).select('+password');
      assert.notEqual(stored.password, account.password);
      assert.equal(await bcrypt.compare(account.password, stored.password), true);
      session = result.data;
    });
    await t.test('normalized duplicate emails return 409', async () => {
      const result = await request('/auth/register', 'POST', { ...account, email: ' STUDENT@campus.edu ' });
      assert.equal(result.status, 409);
      assert.equal(JSON.stringify(result.data).includes('password'), false);
    });
    await t.test('valid login issues a signed token and safe current profile', async () => {
      const result = await request('/auth/login', 'POST', account);
      assert.equal(result.status, 200);
      const claims = jwt.verify(result.data.token, process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: tokenOptions.issuer, audience: tokenOptions.audience });
      assert.equal(claims.sub, session.user._id);
      const me = await request('/auth/me', 'GET', undefined, result.data.token);
      assert.equal(me.status, 200);
      assert.equal(me.data.user.email, account.email);
      assert.equal(me.data.user.password, undefined);
      assert.equal(me.data.token, undefined);
    });
    await t.test('incorrect passwords and unknown accounts have the same 401 response', async () => {
      const badPassword = await request('/auth/login', 'POST', { ...account, password: 'wrong-password' });
      const missingAccount = await request('/auth/login', 'POST', { ...account, email: 'unknown@campus.edu' });
      assert.equal(badPassword.status, 401);
      assert.equal(missingAccount.status, 401);
      assert.deepEqual(badPassword.data, missingAccount.data);
    });
    await t.test('missing, malformed, expired and wrongly signed tokens return 401', async () => {
      const expired = jwt.sign({}, process.env.JWT_SECRET, { ...tokenOptions, subject: session.user._id, expiresIn: -1 });
      const forged = jwt.sign({}, 'another-secret-of-at-least-32-characters', { ...tokenOptions, subject: session.user._id, expiresIn: '1h' });
      for (const token of [undefined, 'bad-token', expired, forged]) assert.equal((await request('/auth/me', 'GET', undefined, token)).status, 401);
    });
    await t.test('all resource admin actions reject regular users', async () => {
      const id = '012345678901234567890123';
      for (const [path, method] of [['/resources', 'POST'], [`/resources/${id}`, 'PUT'], [`/resources/${id}`, 'PATCH'], [`/resources/${id}`, 'DELETE'], ['/resources?includeInactive=true', 'GET'], ['/bookings?scope=all', 'GET']]) {
        assert.equal((await request(path, method, undefined, session.token)).status, 403);
      }
    });
    await t.test('development seed creates a hashed admin but never promotes or overwrites accounts', async () => {
      await assert.rejects(() => seedAdmin(account));
      const admin = { name: 'Development Admin', email: 'admin@campus.edu', password: 'unique-dev-admin-password' };
      await seedAdmin(admin);
      const stored = await User.findOne({ email: admin.email }).select('+password');
      assert.equal(stored.role, 'admin');
      assert.equal(await bcrypt.compare(admin.password, stored.password), true);
      await seedAdmin({ ...admin, password: 'replacement-not-allowed' });
      assert.equal((await User.findById(stored._id).select('+password')).password, stored.password);
    });
    await t.test('role demotion is enforced immediately for an existing token', async () => {
      await User.findByIdAndUpdate(session.user._id, { role: 'admin' });
      assert.equal((await request('/resources?includeInactive=true', 'GET', undefined, session.token)).status, 200);
      await User.findByIdAndUpdate(session.user._id, { role: 'user' });
      assert.equal((await request('/resources?includeInactive=true', 'GET', undefined, session.token)).status, 403);
      await User.findByIdAndDelete(session.user._id);
      assert.equal((await request('/auth/me', 'GET', undefined, session.token)).status, 401);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
