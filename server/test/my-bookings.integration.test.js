import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('My Bookings ownership, admin filters, cancellation history and rebooking on real MongoDB', { skip: !process.env.MONGODB_TEST_URI }, async t => {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.JWT_SECRET = 'my-bookings-integration-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  const { default: mongoose } = await import('mongoose');
  const { app } = await import('../src/app.js');
  const { User } = await import('../src/models/User.js');
  const { Resource } = await import('../src/models/Resource.js');
  const { Booking } = await import('../src/models/Booking.js');
  const database = `campus_my_bookings_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  let server;
  try {
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.ok(topology.setName || topology.msg === 'isdbgrid', 'A replica set or Atlas is required to verify cancellation transactions.');
    await Promise.all([User.init(), Resource.init(), Booking.init()]);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, method = 'GET', body, token) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, headers: response.headers, data: await response.json() };
    }
    const credentials = { name: 'Reservation Owner', email: 'owner@campus.edu', password: 'unique-reservations-password' };
    const owner = (await request('/auth/register', 'POST', credentials)).data;
    const other = (await request('/auth/register', 'POST', { ...credentials, name: 'Other Member', email: 'other@campus.edu' })).data;
    const admin = (await request('/auth/register', 'POST', { ...credentials, name: 'Reservation Admin', email: 'admin@campus.edu' })).data;
    await User.findByIdAndUpdate(admin.user._id, { role: 'admin' });
    const room = await Resource.create({ name: 'Study Room [A]', type: 'room', capacity: 8, location: 'Library' });
    const kit = await Resource.create({ name: 'Camera Kit', type: 'equipment', capacity: 1, location: 'Media desk' });
    const start = new Date(Date.now() + 7 * 86400000), end = new Date(+start + 3600000);
    const payload = { resource: room.id, startTime: start.toISOString(), endTime: end.toISOString(), purpose: 'Study [meeting].* prep' };
    const future = (await request('/bookings', 'POST', payload, owner.token)).data.booking;
    const foreign = (await request('/bookings', 'POST', { ...payload, resource: kit.id, purpose: 'Filming an introduction' }, other.token)).data.booking;
    const past = await Booking.create({ user: owner.user._id, resource: room._id, startTime: new Date(Date.now() - 7200000), endTime: new Date(Date.now() - 3600000), purpose: 'Past study session' });
    const cancelled = await Booking.create({ user: owner.user._id, resource: room._id, startTime: new Date(Date.now() - 14400000), endTime: new Date(Date.now() - 10800000), purpose: 'Previously cancelled', status: 'cancelled', cancelledAt: new Date(Date.now() - 15000000) });
    await t.test('authentication is required and the all-bookings endpoint is admin-only without a scope bypass', async () => {
      for (const path of ['/bookings/me', '/bookings']) assert.equal((await request(path)).status, 401);
      for (const path of ['/bookings', '/bookings?scope=all', '/bookings?scope=mine']) assert.equal((await request(path, 'GET', undefined, owner.token)).status, 403);
      assert.equal((await request('/bookings', 'GET', undefined, admin.token)).status, 200);
    });
    await t.test('personal rows and summary counts only include the authenticated account', async () => {
      const mine = await request('/bookings/me', 'GET', undefined, owner.token);
      assert.equal(mine.status, 200); assert.equal(mine.headers.get('cache-control'), 'no-store');
      assert.equal(mine.data.pagination.total, 3);
      assert.deepEqual(mine.data.summary, { all: 3, upcoming: 1, past: 1, cancelled: 1 });
      assert.ok(mine.data.bookings.every(booking => booking.user._id === owner.user._id));
      assert.ok(mine.data.bookings.every(booking => booking.resource && !booking.user.password && !booking.resource.bookingVersion && !booking.resource.deletedAt));
      assert.equal((await request('/bookings/me', 'GET', undefined, admin.token)).data.pagination.total, 0);
      assert.equal((await request(`/bookings/me?user=${other.user._id}`, 'GET', undefined, owner.token)).status, 400);
      assert.equal((await request('/bookings/me?scope=all', 'GET', undefined, owner.token)).status, 400);
    });
    await t.test('pagination, groups, literal search and status filters are applied on the server', async () => {
      const page = await request('/bookings/me?limit=2&page=1', 'GET', undefined, owner.token);
      assert.equal(page.data.bookings.length, 2); assert.equal(page.data.pagination.totalPages, 2);
      assert.equal((await request('/bookings/me?period=past', 'GET', undefined, owner.token)).data.bookings[0]._id, past.id);
      assert.equal((await request('/bookings/me?status=cancelled', 'GET', undefined, owner.token)).data.bookings[0]._id, cancelled.id);
      const search = new URLSearchParams({ search: '[meeting].*' });
      assert.equal((await request(`/bookings/me?${search}`, 'GET', undefined, owner.token)).data.pagination.total, 1);
      assert.equal((await request('/bookings/me?search=other%40campus.edu', 'GET', undefined, owner.token)).data.pagination.total, 0);
    });
    await t.test('admins filter all reservations by member, resource, type, interval, status and email', async () => {
      const query = new URLSearchParams({ user: other.user._id, resource: kit.id, type: 'equipment', status: 'confirmed', from: new Date(+start - 3600000).toISOString(), to: new Date(+end + 3600000).toISOString(), search: 'other@campus.edu' });
      const result = await request(`/bookings?${query}`, 'GET', undefined, admin.token);
      assert.equal(result.status, 200); assert.equal(result.data.pagination.total, 1);
      assert.equal(result.data.bookings[0]._id, foreign._id);
      assert.equal((await request('/bookings?period=upcoming', 'GET', undefined, admin.token)).data.pagination.total, 2);
      assert.equal((await request('/bookings?scope=all', 'GET', undefined, admin.token)).data.pagination.total, 4);
    });
    await t.test('unauthorized cancellations change neither status nor history', async () => {
      assert.equal((await request(`/bookings/${future._id}/cancel`, 'PATCH')).status, 401);
      const forbidden = await request(`/bookings/${future._id}/cancel`, 'PATCH', undefined, other.token);
      assert.equal(forbidden.status, 403); assert.equal(forbidden.data.error.code, 'BOOKING_FORBIDDEN');
      assert.equal((await Booking.findById(future._id)).status, 'confirmed');
    });
    await t.test('owner cancellation preserves the record and immediately permits rebooking by another member', async () => {
      const count = await Booking.countDocuments();
      const result = await request(`/bookings/${future._id}/cancel`, 'PATCH', undefined, owner.token);
      assert.equal(result.status, 200); assert.equal(result.data.alreadyCancelled, false);
      assert.equal(result.data.booking.status, 'cancelled'); assert.ok(result.data.booking.cancelledAt);
      assert.equal(result.data.booking.purpose, payload.purpose); assert.equal(result.data.booking.resource._id, room.id);
      assert.equal(await Booking.countDocuments(), count);
      const availability = await request(`/resources/${room.id}/availability?${new URLSearchParams({ startTime: payload.startTime, endTime: payload.endTime })}`);
      assert.equal(availability.data.available, true);
      const rebook = await request('/bookings', 'POST', payload, other.token);
      assert.equal(rebook.status, 201);
      assert.equal((await Booking.findById(future._id)).status, 'cancelled');
      future.replacement = rebook.data.booking._id;
    });
    await t.test('repeated cancellation is idempotent, keeps its timestamp and cannot release another booking', async () => {
      const before = await Booking.findById(future._id);
      const again = await request(`/bookings/${future._id}/cancel`, 'PATCH', undefined, owner.token);
      assert.equal(again.status, 200); assert.equal(again.data.alreadyCancelled, true);
      assert.equal(again.data.booking.cancelledAt, before.cancelledAt.toISOString());
      assert.equal((await Booking.findById(future.replacement)).status, 'confirmed');
      assert.equal((await request(`/bookings/${future._id}/cancel`, 'PATCH', undefined, other.token)).status, 403);
    });
    await t.test('admins can cancel another member reservation and release it for a new owner booking', async () => {
      const result = await request(`/bookings/${future.replacement}/cancel`, 'PATCH', undefined, admin.token);
      assert.equal(result.status, 200); assert.equal(result.data.booking.user._id, other.user._id);
      const rebook = await request('/bookings', 'POST', payload, owner.token);
      assert.equal(rebook.status, 201); future.latest = rebook.data.booking._id;
    });
    await t.test('simultaneous owner/admin cancellations commit once and both return a consistent success', async () => {
      const results = await Promise.all([request(`/bookings/${future.latest}/cancel`, 'PATCH', undefined, owner.token), request(`/bookings/${future.latest}/cancel`, 'PATCH', undefined, admin.token)]);
      assert.deepEqual(results.map(result => result.status), [200, 200]);
      assert.deepEqual(results.map(result => result.data.alreadyCancelled).sort(), [false, true]);
      assert.equal(results[0].data.booking.cancelledAt, results[1].data.booking.cancelledAt);
      assert.equal(await Booking.countDocuments({ resource: room._id, status: 'confirmed', startTime: start }), 0);
    });
    await t.test('past confirmed reservations stay immutable while already-cancelled past records remain idempotent', async () => {
      assert.equal((await request(`/bookings/${past.id}/cancel`, 'PATCH', undefined, owner.token)).status, 400);
      assert.equal((await request(`/bookings/${cancelled.id}/cancel`, 'PATCH', undefined, owner.token)).data.alreadyCancelled, true);
      const ongoing = await Booking.create({ user: owner.user._id, resource: room._id, startTime: new Date(Date.now() - 900000), endTime: new Date(Date.now() + 1800000), purpose: 'An ongoing session' });
      assert.equal((await request(`/bookings/${ongoing.id}/cancel`, 'PATCH', undefined, owner.token)).status, 200);
    });
    await t.test('archived resource details remain in reservation history and invalid IDs/filters are rejected', async () => {
      await Resource.findByIdAndUpdate(room._id, { isActive: false, deletedAt: new Date() });
      const history = await request('/bookings/me?period=cancelled', 'GET', undefined, owner.token);
      assert.ok(history.data.bookings.some(booking => booking.resource?.name === room.name));
      assert.equal((await request('/bookings/bad-id/cancel', 'PATCH', undefined, owner.token)).status, 400);
      assert.equal((await request(`/bookings/${new mongoose.Types.ObjectId()}/cancel`, 'PATCH', undefined, owner.token)).status, 404);
      for (const query of ['limit=101', 'status=pending', 'from=bad-date', 'sort=invalid']) assert.equal((await request(`/bookings/me?${query}`, 'GET', undefined, owner.token)).status, 400);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase(); await mongoose.disconnect();
  }
});
