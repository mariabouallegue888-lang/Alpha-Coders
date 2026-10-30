import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('admin authorization and accurate real MongoDB aggregation', { skip: !process.env.MONGODB_TEST_URI }, async t => {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.JWT_SECRET = 'admin-dashboard-test-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  const { default: mongoose } = await import('mongoose');
  const { default: jwt } = await import('jsonwebtoken');
  const { app } = await import('../src/app.js');
  const { User } = await import('../src/models/User.js');
  const { Resource } = await import('../src/models/Resource.js');
  const { Booking } = await import('../src/models/Booking.js');
  const { issueToken, tokenOptions } = await import('../src/services/tokenService.js');
  const { getAdminDashboard, getResourceUtilization } = await import('../src/services/adminDashboardService.js');
  const database = `campus_admin_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  let server;
  try {
    await Promise.all([User.init(), Resource.init(), Booking.init()]);
    const admin = await User.create({ name: 'Campus Admin', email: 'admin@campus.edu', password: 'stored-hash-not-for-output', role: 'admin' });
    const student = await User.create({ name: 'Campus Student', email: 'student@campus.edu', password: 'private-student-hash', role: 'user' });
    const adminToken = issueToken(admin), studentToken = issueToken(student);
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, token) {
      const response = await fetch(base + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      return { status: response.status, data: await response.json(), cache: response.headers.get('cache-control') };
    }
    const paths = ['/admin/dashboard', '/admin/dashboard/utilization'];
    await t.test('both endpoints require a signed, unexpired JWT and current admin role', async () => {
      const expired = jwt.sign({}, process.env.JWT_SECRET, { ...tokenOptions, subject: String(admin._id), expiresIn: -1 });
      const forged = jwt.sign({}, 'different-secret-at-least-32-characters', { ...tokenOptions, subject: String(admin._id), expiresIn: 3600 });
      for (const path of paths) {
        for (const token of [undefined, 'invalid', expired, forged]) assert.equal((await request(path, token)).status, 401);
        assert.equal((await request(path, studentToken)).status, 403);
        const result = await request(path, adminToken);
        assert.equal(result.status, 200);
        assert.equal(result.cache, 'no-store');
      }
      await User.findByIdAndUpdate(admin._id, { role: 'user' });
      for (const path of paths) assert.equal((await request(path, adminToken)).status, 403);
      await User.findByIdAndUpdate(admin._id, { role: 'admin' });
    });
    await t.test('empty database reports zeros and validates bounded query parameters', async () => {
      const overview = (await request(paths[0], adminToken)).data;
      assert.deepEqual(overview.kpis, { totalResources: 0, activeResources: 0, confirmedUpcomingReservations: 0, cancelledReservations: 0, inProgressReservations: 0 });
      assert.deepEqual(overview.recentActivity, []);
      const usage = (await request(paths[1], adminToken)).data;
      assert.equal(usage.scheduledHours, 0);
      assert.equal(usage.utilizationPercent, null);
      for (const query of ['?upcomingLimit=0', '?activityLimit=21', '?upcomingLimit=1.5', '?unknown=1']) assert.equal((await request(paths[0] + query, adminToken)).status, 400);
      for (const query of ['?days=365', '?days=0', '?limit=11', '?limit=-1', '?unknown=1']) assert.equal((await request(paths[1] + query, adminToken)).status, 400);
    });
    const fixed = new Date('2030-01-31T12:00:00Z');
    const createdAt = new Date('2030-01-23T12:00:00Z');
    const room = await Resource.create({ name: 'Study Room', type: 'room', capacity: 6, location: 'Library', isActive: true, createdAt });
    await Resource.create({ name: 'Science Lab', type: 'lab', capacity: 12, location: 'Science', isActive: false, createdAt });
    const equipment = await Resource.create({ name: 'Camera Kit', type: 'equipment', capacity: 1, location: 'Media', isActive: true, createdAt });
    const archived = await Resource.create({ name: 'Archived Room', type: 'room', capacity: 4, location: 'Old Library', isActive: false, deletedAt: new Date('2030-01-30T10:00Z'), createdAt });
    const create = (resource, start, end, status = 'confirmed', cancelledAt = null) => Booking.create({ user: student._id, resource: resource._id, startTime: new Date(start), endTime: new Date(end), purpose: 'Research session', status, cancelledAt, createdAt });
    await create(room, '2030-01-24T11:00Z', '2030-01-24T13:00Z');
    await create(room, '2030-01-25T23:00Z', '2030-01-26T01:00Z');
    const ongoing = await create(room, '2030-01-31T11:00Z', '2030-01-31T13:00Z');
    await create(room, '2030-01-24T10:00Z', '2030-01-24T12:00Z');
    await create(equipment, '2030-01-31T12:00Z', '2030-01-31T14:00Z');
    await create(archived, '2030-01-27T10:00Z', '2030-01-27T11:00Z');
    const cancelled = await create(equipment, '2030-01-29T10:00Z', '2030-01-29T11:00Z', 'cancelled', new Date('2030-01-30T12:00Z'));
    const legacyCancelled = await create(room, '2030-02-01T10:00Z', '2030-02-01T11:00Z', 'cancelled');
    await t.test('KPI totals exclude archives, include inactive inventory, and use exclusive end boundaries', async () => {
      const data = await getAdminDashboard({ upcomingLimit: 1, activityLimit: 1 }, fixed);
      assert.deepEqual(data.kpis, { totalResources: 3, activeResources: 2, confirmedUpcomingReservations: 2, cancelledReservations: 2, inProgressReservations: 2 });
      // A reservation starting exactly at asOf is already in progress; an end exactly at asOf is not upcoming.
      assert.deepEqual(data.resourceDistribution, [{ type: 'room', total: 1, active: 1 }, { type: 'lab', total: 1, active: 0 }, { type: 'equipment', total: 1, active: 1 }]);
      assert.equal(data.upcomingBookings.length, 1);
      assert.equal(String(data.upcomingBookings[0]._id), String(ongoing._id));
      const boundary = await getAdminDashboard({}, new Date('2030-01-31T13:00Z'));
      assert.equal(boundary.kpis.confirmedUpcomingReservations, 1);
      const http = await request(paths[0], adminToken);
      assert.equal(http.status, 200);
      const expectedUpcoming = await Booking.countDocuments({ status: 'confirmed', endTime: { $gt: new Date(http.data.asOf) } });
      assert.equal(http.data.kpis.confirmedUpcomingReservations, expectedUpcoming);
    });
    await t.test('scheduled hours clip both edges, split UTC midnight, and preserve archived history', async () => {
      const usage = await getResourceUtilization({ days: 7, limit: 1 }, fixed);
      assert.equal(usage.window.start, '2030-01-24T12:00:00.000Z');
      assert.equal(usage.scheduledHours, 5);
      assert.equal(usage.bookingCount, 4);
      assert.equal(usage.resourcesUsed, 2);
      assert.equal(usage.topResources.length, 1);
      assert.equal(String(usage.topResources[0].resourceId), String(room._id));
      assert.equal(usage.topResources[0].scheduledHours, 4);
      const hours = Object.fromEntries(usage.daily.map(row => [row.date, row.scheduledHours]));
      assert.deepEqual(hours, { '2030-01-24': 1, '2030-01-25': 1, '2030-01-26': 1, '2030-01-27': 1, '2030-01-28': 0, '2030-01-29': 0, '2030-01-30': 0, '2030-01-31': 1 });
      assert.equal(usage.daily.reduce((sum, row) => sum + row.scheduledHours, 0), usage.scheduledHours);
      assert.equal(usage.utilizationPercent, null);
      const expanded = await getResourceUtilization({ days: 7, limit: 5 }, fixed);
      assert.equal(expanded.topResources[1].resource.name, 'Archived Room');
    });
    await t.test('activity uses recorded timestamps, never guesses cancellation dates or exposes hashes', async () => {
      const result = await getAdminDashboard({ activityLimit: 20 }, fixed);
      assert.ok(result.recentActivity.some(event => event.id === `booking_cancelled:${cancelled._id}`));
      assert.ok(!result.recentActivity.some(event => event.id === `booking_cancelled:${legacyCancelled._id}`));
      assert.ok(result.recentActivity.some(event => event.id === `resource_archived:${archived._id}`));
      assert.ok(result.recentActivity.every((event, i, rows) => i === 0 || +new Date(rows[i - 1].at) >= +new Date(event.at)));
      await Resource.updateOne({ _id: room._id }, { $inc: { bookingVersion: 1 } });
      const limited = await getAdminDashboard({ activityLimit: 2 }, fixed);
      assert.equal(limited.recentActivity.length, 2);
      assert.ok(!limited.recentActivity.some(event => event.kind === 'resource_updated'));
      for (const output of [result, (await request(paths[0], adminToken)).data, (await request(paths[1], adminToken)).data]) {
        const serialized = JSON.stringify(output);
        for (const secret of ['password', 'stored-hash-not-for-output', 'private-student-hash', 'bookingVersion', 'JWT_SECRET']) assert.ok(!serialized.includes(secret), secret);
      }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
