import test from 'node:test';
import assert from 'node:assert/strict';
import { integrationHarness, testCalendar } from './helpers/integration.js';

test('mandatory acceptance scenarios through the real Express API and MongoDB replica set', { skip: !process.env.MONGODB_TEST_URI }, async t => {
  const { request, User, Resource, Booking } = await integrationHarness(t);
  const register = async (name, email) => {
    const result = await request('/auth/register', 'POST', { name, email, password: 'acceptance-password-unique', role: 'admin' });
    assert.equal(result.status, 201);
    assert.equal(result.data.user.role, 'user');
    return result.data;
  };
  const a = await register('User A', 'a@campus.edu'), b = await register('User B', 'b@campus.edu'), admin = await register('Admin', 'admin@campus.edu');
  await User.findByIdAndUpdate(admin.user._id, { role: 'admin' });
  const roomInput = { name: 'Room A', type: 'room', capacity: 8, location: 'North Library', description: 'Acceptance test study room', isActive: true };
  const createRoom = await request('/resources', 'POST', roomInput, admin.token);
  assert.equal(createRoom.status, 201);
  const room = createRoom.data.resource;
  const otherRoom = (await request('/resources', 'POST', { ...roomInput, name: 'Room B' }, admin.token)).data.resource;
  const { at, day } = testCalendar();
  const input = (start, end, resource = room._id, offset = 0) => ({ resource, startTime: at(start, offset), endTime: at(end, offset), purpose: 'Acceptance study session' });
  const reserve = (user, body) => request('/bookings', 'POST', body, user.token);
  let original;
  await t.test('security policy allows resource photos and keeps external scripts restricted', async () => {
    const response = await request('/health');
    const csp = response.headers.get('content-security-policy');
    assert.match(csp, /(?:^|;)img-src[^;]*https:/);
    assert.match(csp, /(?:^|;)script-src 'self'(?:;|$)/);
    assert.ok(!csp.includes('upgrade-insecure-requests'), 'Test/development HTTP must not be upgraded to HTTPS.');
  });
  await t.test('1. User A reserves Room A 10:00–12:00: 201', async () => {
    const result = await reserve(a, input(10, 12));
    assert.equal(result.status, 201); original = result.data.booking;
    assert.equal(original.startTime, at(10)); assert.equal(original.status, 'confirmed');
  });
  await t.test('2. User B attempts Room A 11:00–13:00: structured 409', async () => {
    const result = await reserve(b, input(11, 13));
    assert.equal(result.status, 409); assert.equal(result.data.error.code, 'BOOKING_CONFLICT');
    assert.match(result.data.error.message, /already booked/);
  });
  await t.test('3. User B reserves adjacent Room A 12:00–13:00: 201', async () => {
    assert.equal((await reserve(b, input(12, 13))).status, 201);
  });
  await t.test('4. Owner cancellation releases 10:00–12:00 and preserves history', async () => {
    assert.equal((await request(`/bookings/${original._id}/cancel`, 'PATCH', undefined, b.token)).status, 403);
    assert.equal((await request(`/bookings/${original._id}/cancel`, 'PATCH', undefined, a.token)).status, 200);
    const schedule = (await request(`/resources/${room._id}/availability?date=${day}`)).data;
    assert.ok(schedule.free.some(slot => slot.startTime <= at(10) && slot.endTime >= at(12)));
    assert.equal((await reserve(b, input(10, 12))).status, 201);
    assert.equal((await Booking.findById(original._id)).status, 'cancelled');
  });
  await t.test('5. Regular user accesses admin endpoints: 403', async () => {
    for (const path of ['/bookings', '/resources?includeInactive=true', '/admin/dashboard', '/admin/dashboard/utilization']) assert.equal((await request(path, 'GET', undefined, a.token)).status, 403);
  });
  await t.test('6. End before start and past start: 400 with no inserts', async () => {
    const before = await Booking.countDocuments();
    const inverted = await reserve(a, input(15, 14));
    assert.equal(inverted.status, 400); assert.equal(inverted.data.error.code, 'INVALID_BOOKING_INTERVAL');
    const past = await reserve(a, { ...input(10, 12), startTime: '2000-01-01T10:00:00Z', endTime: '2000-01-01T12:00:00Z' });
    assert.equal(past.status, 400); assert.equal(past.data.error.code, 'BOOKING_START_IN_PAST');
    assert.equal(await Booking.countDocuments(), before);
  });
  await t.test('exact 30-minute and 4-hour boundaries work; outside durations fail', async () => {
    assert.equal((await reserve(a, input(8, 12, room._id, 1))).status, 201);
    assert.equal((await reserve(b, input(12, 12.5, room._id, 1))).status, 201);
    for (const end of [14, 14.25, 18.01]) assert.equal((await reserve(a, input(14, end, room._id, 1))).status, 400);
  });
  await t.test('resource isolation, search, CRUD and future-reservation deletion constraints', async () => {
    assert.equal((await reserve(a, input(10, 12, otherRoom._id))).status, 201);
    const filtered = await request('/resources?search=Room%20A&type=room&limit=1');
    assert.equal(filtered.data.pagination.total, 1); assert.equal(filtered.data.resources[0]._id, room._id);
    assert.equal((await request(`/resources/${room._id}`, 'DELETE', undefined, admin.token)).status, 409);
    const replacement = await request(`/resources/${room._id}`, 'PUT', { ...roomInput, capacity: 12 }, admin.token);
    assert.equal(replacement.status, 200); assert.equal(replacement.data.resource.capacity, 12);
    const temporary = (await request('/resources', 'POST', { ...roomInput, name: 'Temporary room' }, admin.token)).data.resource;
    assert.equal((await request(`/resources/${temporary._id}`, 'DELETE', undefined, admin.token)).status, 200);
    assert.equal((await request(`/resources/${temporary._id}`)).status, 404);
  });
  await t.test('five rounds of competing HTTP writes never create overlapping confirmed bookings', async () => {
    for (let round = 0; round < 5; round++) {
      const body = input(10, 12, room._id, round + 2);
      const results = await Promise.all(Array.from({ length: 5 }, (_, i) => reserve(i % 2 ? a : b, body)));
      assert.deepEqual(results.map(result => result.status).sort(), [201, 409, 409, 409, 409]);
      assert.ok(results.filter(result => result.status === 409).every(result => result.data.error.code === 'BOOKING_CONFLICT'));
    }
    const rows = await Booking.find({ status: 'confirmed' }).sort({ resource: 1, startTime: 1 }).lean();
    for (let i = 1; i < rows.length; i++) if (String(rows[i - 1].resource) === String(rows[i].resource)) assert.ok(rows[i - 1].endTime <= rows[i].startTime, 'Overlapping active bookings were persisted.');
    assert.ok((await Resource.findById(room._id).select('+bookingVersion')).bookingVersion > 0);
  });
});
