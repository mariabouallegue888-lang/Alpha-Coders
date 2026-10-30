import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('booking engine HTTP integration on a real MongoDB replica set', { skip: !process.env.MONGODB_TEST_URI }, async t => {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.JWT_SECRET = 'booking-engine-integration-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  const { default: mongoose } = await import('mongoose');
  const { app } = await import('../src/app.js');
  const { User } = await import('../src/models/User.js');
  const { Resource } = await import('../src/models/Resource.js');
  const { Booking } = await import('../src/models/Booking.js');
  const database = `campus_engine_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  let server;
  try {
    const topology = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.ok(topology.setName || topology.msg === 'isdbgrid', 'Integration tests require a replica set or Atlas; standalone MongoDB cannot establish concurrency safety.');
    await Promise.all([User.init(), Resource.init(), Booking.init()]);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, method = 'GET', body, token) {
      const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, data: await response.json() };
    }
    const account = { name: 'Booking Student', email: 'booker@campus.edu', password: 'unique-booking-test-password' };
    const owner = (await request('/auth/register', 'POST', account)).data;
    const other = (await request('/auth/register', 'POST', { ...account, email: 'other@campus.edu' })).data;
    const room = await Resource.create({ name: 'Engine room', type: 'room', capacity: 8, location: 'Library' });
    const separate = await Resource.create({ name: 'Other room', type: 'room', capacity: 8, location: 'Library' });
    const day = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    const at = hour => `${day}T${String(hour).padStart(2, '0')}:00:00.000Z`;
    const input = (startTime = at(10), endTime = at(12), resource = room.id) => ({ resource, startTime, endTime, purpose: 'Server integration study group' });
    const reserve = body => request('/bookings', 'POST', body, owner.token);
    let winner;
    await t.test('simultaneous competing requests produce exactly one booking and structured conflicts', async () => {
      const competing = await Promise.all(Array.from({ length: 5 }, () => reserve(input())));
      assert.equal(competing.filter(result => result.status === 201).length, 1, JSON.stringify(competing));
      for (const result of competing.filter(entry => entry.status !== 201)) {
        assert.equal(result.status, 409, JSON.stringify(result));
        assert.equal(result.data.error.code, 'BOOKING_CONFLICT');
        assert.match(result.data.error.message, /already booked/);
      }
      assert.equal(await Booking.countDocuments({ resource: room._id, status: 'confirmed' }), 1);
      winner = competing.find(result => result.status === 201).data.booking;
      assert.equal(winner.status, 'confirmed');
    });
    await t.test('contained, containing, partial and identical overlaps are blocked', async () => {
      for (const body of [input(at(11), `${day}T11:30:00Z`), input(at(9), at(13)), input(at(9), `${day}T10:30:00Z`), input(`${day}T11:30:00Z`, `${day}T12:30:00Z`), input()]) {
        const result = await reserve(body);
        assert.equal(result.status, 409);
        assert.equal(result.data.error.code, 'BOOKING_CONFLICT');
      }
    });
    await t.test('adjacent intervals before and after an existing booking are valid', async () => {
      assert.equal((await reserve(input(at(8), at(10)))).status, 201);
      assert.equal((await reserve(input(at(12), at(13)))).status, 201);
    });
    await t.test('different resources can be booked concurrently for the same interval', async () => {
      const third = await Resource.create({ name: 'Independent lab', type: 'lab', capacity: 12, location: 'Engineering' });
      const results = await Promise.all([reserve(input(at(10), at(12), separate.id)), reserve(input(at(10), at(12), third.id))]);
      assert.deepEqual(results.map(result => result.status), [201, 201]);
    });
    await t.test('past, inverted, zero length and out-of-bounds duration requests leave no bookings', async () => {
      const count = await Booking.countDocuments();
      const start = new Date(at(18));
      const cases = [
        [input(new Date(Date.now() - 60000).toISOString(), new Date(Date.now() + 3600000).toISOString()), 'BOOKING_START_IN_PAST'],
        [input(at(18), at(17)), 'INVALID_BOOKING_INTERVAL'],
        [input(at(18), at(18)), 'INVALID_BOOKING_INTERVAL'],
        [input(start.toISOString(), new Date(+start + 1799999).toISOString()), 'BOOKING_TOO_SHORT'],
        [input(start.toISOString(), new Date(+start + 14400001).toISOString()), 'BOOKING_TOO_LONG'],
        [input('not-a-date', at(19)), 'VALIDATION_ERROR'],
      ];
      for (const [body, code] of cases) {
        const result = await reserve(body);
        assert.equal(result.status, 400); assert.equal(result.data.error.code, code);
      }
      assert.equal(await Booking.countDocuments(), count);
    });
    await t.test('exact minimum and maximum durations succeed', async () => {
      assert.equal((await reserve(input(at(18), `${day}T18:30:00Z`))).status, 201);
      assert.equal((await reserve(input(at(0), at(4)))).status, 201);
    });
    await t.test('inactive, archived and missing resources cannot be reserved', async () => {
      const inactive = await Resource.create({ name: 'Inactive kit', type: 'equipment', capacity: 1, location: 'Media', isActive: false });
      const archived = await Resource.create({ name: 'Archived kit', type: 'equipment', capacity: 1, location: 'Media', deletedAt: new Date() });
      for (const id of [inactive.id, archived.id, String(new mongoose.Types.ObjectId())]) {
        const result = await reserve(input(at(10), at(12), id));
        assert.equal(result.status, 404); assert.equal(result.data.error.code, 'RESOURCE_UNAVAILABLE');
      }
      assert.equal((await request('/bookings', 'POST', input())).status, 401);
    });
    await t.test('my bookings returns only the authenticated account and safe populated references', async () => {
      const mine = await request('/bookings/me', 'GET', undefined, owner.token);
      assert.equal(mine.status, 200);
      assert.ok(mine.data.bookings.length > 0);
      assert.ok(mine.data.bookings.every(booking => booking.user._id === owner.user._id && booking.resource !== null && !booking.user.password));
      assert.equal((await request('/bookings/me', 'GET', undefined, other.token)).data.bookings.length, 0);
      assert.equal((await request('/bookings/me')).status, 401);
    });
    await t.test('cancellation releases availability, remains idempotent, and prevents foreign cancellation', async () => {
      assert.equal((await request(`/bookings/${winner._id}/cancel`, 'PATCH', undefined, other.token)).status, 403);
      assert.equal((await request(`/bookings/${winner._id}/cancel`, 'PATCH', undefined, owner.token)).status, 200);
      assert.equal((await request(`/bookings/${winner._id}/cancel`, 'PATCH', undefined, owner.token)).status, 200);
      const availability = await request(`/resources/${room.id}/availability?date=${day}`);
      assert.equal(availability.status, 200);
      assert.deepEqual(availability.data.blockingStatuses, ['confirmed']);
      assert.equal(availability.data.minDurationMinutes, 30); assert.equal(availability.data.maxDurationMinutes, 240);
      assert.ok(availability.data.free.some(interval => interval.startTime === at(10) && interval.endTime === at(12)));
      assert.deepEqual(Object.keys(availability.data.busy[0]).sort(), ['endTime', 'startTime']);
      assert.equal((await reserve(input())).status, 201);
    });
    await t.test('offset timestamps normalize to UTC and still conflict with the same instant', async () => {
      const created = await reserve(input(`${day}T16:00:00+02:00`, `${day}T17:00:00+02:00`));
      assert.equal(created.status, 201); assert.equal(created.data.booking.startTime, at(14));
      assert.equal((await reserve(input(at(14), at(15)))).status, 409);
    });
    await t.test('UTC day availability clips reservations across midnight and rejects invalid dates', async () => {
      const next = new Date(+new Date(at(0)) + 86400000).toISOString().slice(0, 10);
      assert.equal((await reserve(input(at(23), `${next}T01:00:00Z`))).status, 201);
      const availability = await request(`/resources/${room.id}/availability?date=${next}`);
      assert.equal(availability.data.busy[0].startTime, `${next}T00:00:00.000Z`);
      assert.equal(availability.data.busy[0].endTime, `${next}T01:00:00.000Z`);
      assert.equal((await request(`/resources/${room.id}/availability?date=2030-02-30`)).status, 400);
      assert.equal((await request(`/resources/${room.id}/availability?date=${day}&startTime=${at(10)}&endTime=${at(12)}`)).status, 400);
    });
    await t.test('unimplemented approval statuses cannot be stored and public status overrides are ignored', async () => {
      for (const status of ['pending', 'approved', 'rejected']) {
        const candidate = new Booking({ user: owner.user._id, resource: room._id, startTime: new Date(at(6)), endTime: new Date(at(7)), purpose: 'Status policy test', status });
        await assert.rejects(() => candidate.validate());
      }
      const result = await reserve({ ...input(at(6), at(7)), status: 'pending' });
      assert.equal(result.status, 201); assert.equal(result.data.booking.status, 'confirmed');
    });
    await t.test('the final confirmed booking set has no overlapping pairs on any resource', async () => {
      const bookings = await Booking.find({ status: 'confirmed' }).sort({ resource: 1, startTime: 1 });
      for (let i = 0; i < bookings.length; i++) for (let j = i + 1; j < bookings.length; j++) {
        if (String(bookings[i].resource) !== String(bookings[j].resource)) continue;
        assert.ok(!(bookings[i].startTime < bookings[j].endTime && bookings[i].endTime > bookings[j].startTime));
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
