import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('real MongoDB: auth, authorization, concurrent booking, cancellation and history', { skip: !process.env.MONGODB_TEST_URI }, async () => {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.JWT_SECRET = 'integration-test-only-secret-32-characters-long';
  process.env.NODE_ENV = 'test';
  const { default: mongoose } = await import('mongoose');
  const { app } = await import('../src/app.js');
  const { User } = await import('../src/models/User.js');
  const { Resource } = await import('../src/models/Resource.js');
  const { Booking } = await import('../src/models/Booking.js');
  const database = `campus_booking_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, method = 'GET', body, token) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  try {
    await Promise.all([User.init(), Resource.init(), Booking.init()]);
    assert.equal((await request('/health')).status, 200);
    assert.equal((await request('/bookings')).status, 401);
    assert.equal((await request('/auth/me', 'GET', undefined, 'invalid-token')).status, 401);
    const input = { name: 'Student One', email: 'student@campus.edu', password: 'secure-password', role: 'admin' };
    const first = await request('/auth/register', 'POST', input);
    assert.equal(first.status, 201);
    assert.equal(first.data.user.role, 'user');
    assert.equal(first.data.user.password, undefined);
    assert.equal((await request('/auth/register', 'POST', input)).status, 409);
    assert.equal((await request('/auth/login', 'POST', { email: input.email, password: 'wrong' })).status, 401);
    const login = await request('/auth/login', 'POST', input);
    assert.equal(login.status, 200);
    assert.equal(login.data.user.password, undefined);
    const token = login.data.token;
    const second = await request('/auth/register', 'POST', { ...input, email: 'second@campus.edu' });
    const third = await request('/auth/register', 'POST', { ...input, email: 'third@campus.edu' });
    const resourceInput = { name: 'Integration room', type: 'room', capacity: 8, location: 'Test Building' };
    assert.equal((await request('/resources', 'POST', resourceInput, token)).status, 403);
    await User.findByIdAndUpdate(first.data.user._id, { role: 'admin' });
    const resource = await request('/resources', 'POST', resourceInput, token);
    assert.equal(resource.status, 201);
    const resourceId = resource.data.resource._id;
    const start = new Date(Date.now() + 86400000), end = new Date(+start + 3600000);
    const booking = { resource: resourceId, startTime: start.toISOString(), endTime: end.toISOString(), purpose: 'Integration study session' };
    const concurrent = await Promise.all([request('/bookings', 'POST', booking, token), request('/bookings', 'POST', booking, second.data.token)]);
    assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
    const winnerIndex = concurrent.findIndex(r => r.status === 201);
    const winner = concurrent[winnerIndex].data.booking;
    assert.equal((await request(`/bookings/${winner._id}/cancel`, 'PATCH', undefined, third.data.token)).status, 403);
    assert.equal((await request('/bookings/me', 'GET', undefined, third.data.token)).data.bookings.length, 0);
    assert.equal((await request('/bookings?scope=all', 'GET', undefined, second.data.token)).status, 403);
    assert.equal((await request('/bookings', 'POST', { ...booking, startTime: end.toISOString(), endTime: new Date(+end + 3600000).toISOString() }, token)).status, 201);
    const availability = await request(`/resources/${resourceId}/availability?${new URLSearchParams({ startTime: booking.startTime, endTime: booking.endTime })}`);
    assert.equal(availability.data.available, false);
    assert.equal((await request(`/bookings/${winner._id}/cancel`, 'PATCH', undefined, token)).status, 200);
    assert.equal((await request('/bookings', 'POST', booking, second.data.token)).status, 201);
    assert.equal((await request(`/resources/${resourceId}`, 'DELETE', undefined, token)).status, 409);
    const confirmed = (await request('/bookings?scope=all', 'GET', undefined, token)).data.bookings.filter(b => b.status === 'confirmed');
    for (const entry of confirmed) assert.equal((await request(`/bookings/${entry._id}/cancel`, 'PATCH', undefined, token)).status, 200);
    assert.equal((await request(`/resources/${resourceId}`, 'DELETE', undefined, token)).status, 200);
    assert.equal((await request('/resources')).data.resources.length, 0);
    assert.equal((await request(`/bookings?scope=all`, 'GET', undefined, token)).data.bookings[0].resource.name, resourceInput.name);
    assert.equal((await request('/bookings', 'POST', { ...booking, startTime: new Date(+end + 7200000).toISOString(), endTime: new Date(+end + 10800000).toISOString() }, token)).status, 404);
    assert.equal((await request('/resources/not-an-id')).status, 400);
  } finally {
    await new Promise(resolve => server.close(resolve));
    // Only the unique database created above is removed; application data is untouched.
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
