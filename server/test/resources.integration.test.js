import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

test('resource CRUD, visibility, pagination, validation and deletion with real MongoDB', { skip: !process.env.MONGODB_TEST_URI }, async t => {
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.JWT_SECRET = 'resource-integration-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  const { default: mongoose } = await import('mongoose');
  const { app } = await import('../src/app.js');
  const { User } = await import('../src/models/User.js');
  const { Resource } = await import('../src/models/Resource.js');
  const { Booking } = await import('../src/models/Booking.js');
  const database = `campus_resources_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  async function request(path, method = 'GET', body, token) {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  }
  try {
    await Promise.all([User.init(), Resource.init(), Booking.init()]);
    const credentials = { name: 'Resource Admin', email: 'admin@campus.edu', password: 'unique-password-for-resources' };
    const admin = (await request('/auth/register', 'POST', credentials)).data;
    await User.findByIdAndUpdate(admin.user._id, { role: 'admin' });
    const student = (await request('/auth/register', 'POST', { ...credentials, email: 'student@campus.edu' })).data;
    const input = { name: 'Room [A]', type: 'room', capacity: 8, location: 'Library East', description: 'A quiet room for shared study.', imageUrl: 'https://example.edu/room.jpg', isActive: true };
    let id;
    await t.test('only admins can create, replace, patch and delete resources', async () => {
      for (const [path, method] of [['/resources', 'POST'], ['/resources/012345678901234567890123', 'PUT'], ['/resources/012345678901234567890123', 'PATCH'], ['/resources/012345678901234567890123', 'DELETE']]) {
        assert.equal((await request(path, method, input)).status, 401);
        assert.equal((await request(path, method, input, student.token)).status, 403);
      }
    });
    await t.test('create and fetch full resource information', async () => {
      const created = await request('/resources', 'POST', input, admin.token);
      assert.equal(created.status, 201);
      assert.equal(created.data.resource.deletedAt, undefined);
      assert.equal(created.data.resource.bookingVersion, undefined);
      id = created.data.resource._id;
      const detail = await request(`/resources/${id}`);
      assert.equal(detail.status, 200);
      for (const key of Object.keys(input)) assert.equal(detail.data.resource[key], input[key]);
      assert.equal(detail.data.resource.bookingVersion, undefined);
      assert.equal(detail.data.resource.deletedAt, undefined);
    });
    await t.test('ObjectIds, required fields, capacity, resource types and URL schemes are validated', async () => {
      for (const changes of [{ capacity: 0 }, { capacity: -1 }, { capacity: 1.5 }, { capacity: '8' }, { type: 'office' }, { imageUrl: 'javascript:alert(1)' }, { imageUrl: 'https://user:secret@example.edu/image.jpg' }, { name: '' }]) {
        assert.equal((await request('/resources', 'POST', { ...input, ...changes }, admin.token)).status, 400);
      }
      assert.equal((await request('/resources', 'POST', {}, admin.token)).status, 400);
      for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await request('/resources/bad-id', method, method === 'PUT' ? input : undefined, admin.token)).status, 400);
      assert.equal((await request('/resources/012345678901234567890123')).status, 404);
      assert.equal((await request(`/resources/${id}`, 'PUT', { capacity: 5 }, admin.token)).status, 400);
    });
    await t.test('PUT replaces editable fields while PATCH preserves omitted fields', async () => {
      const updated = await request(`/resources/${id}`, 'PUT', { ...input, capacity: 12, description: 'Updated description' }, admin.token);
      assert.equal(updated.status, 200);
      assert.equal(updated.data.resource.capacity, 12);
      const patched = await request(`/resources/${id}`, 'PATCH', { location: 'Library West' }, admin.token);
      assert.equal(patched.status, 200);
      assert.equal(patched.data.resource.description, 'Updated description');
      assert.equal((await request(`/resources/${id}`, 'PATCH', {}, admin.token)).status, 400);
    });
    await t.test('inactive resources are visible only to admins and cannot be booked', async () => {
      assert.equal((await request(`/resources/${id}`, 'PUT', { ...input, isActive: false }, admin.token)).status, 200);
      assert.equal((await request(`/resources/${id}`)).status, 404);
      assert.equal((await request(`/resources/${id}`, 'GET', undefined, student.token)).status, 404);
      assert.equal((await request(`/resources/${id}`, 'GET', undefined, admin.token)).status, 200);
      assert.equal((await request('/resources')).data.pagination.total, 0);
      assert.equal((await request('/resources?includeInactive=true')).status, 401);
      assert.equal((await request('/resources?includeInactive=true', 'GET', undefined, student.token)).status, 403);
      const inactive = await request('/resources?includeInactive=true&isActive=false', 'GET', undefined, admin.token);
      assert.equal(inactive.data.pagination.total, 1);
      const start = new Date(Date.now() + 86400000);
      assert.equal((await request('/bookings', 'POST', { resource: id, startTime: start.toISOString(), endTime: new Date(+start + 3600000).toISOString(), purpose: 'Study session' }, student.token)).status, 404);
      await request(`/resources/${id}`, 'PUT', input, admin.token);
    });
    await t.test('search, type filters, pagination counts and stable ordering cover all matching records', async () => {
      await request('/resources', 'POST', { ...input, name: 'Camera Kit', type: 'equipment' }, admin.token);
      await request('/resources', 'POST', { ...input, name: 'Computing Lab', type: 'lab' }, admin.token);
      const first = await request('/resources?limit=2&page=1');
      const second = await request('/resources?limit=2&page=2');
      assert.deepEqual(first.data.pagination, { page: 1, limit: 2, total: 3, totalPages: 2, hasNextPage: true, hasPreviousPage: false });
      assert.equal(second.data.resources.length, 1);
      assert.equal(second.data.pagination.hasNextPage, false);
      assert.equal(new Set([...first.data.resources, ...second.data.resources].map(r => r._id)).size, 3);
      assert.equal((await request('/resources?type=lab')).data.resources[0].name, 'Computing Lab');
      assert.equal((await request('/resources?search=%5BA%5D')).data.resources[0]._id, id);
      assert.equal((await request('/resources?search=LIBRARY')).data.pagination.total, 3);
      assert.equal((await request('/resources?search=absent')).data.pagination.total, 0);
      assert.deepEqual(first.data.typeCounts, { room: 1, lab: 1, equipment: 1 });
      for (const query of ['page=0', 'limit=101', 'type=office', 'page=1.5']) assert.equal((await request(`/resources?${query}`)).status, 400);
    });
    await t.test('future and ongoing confirmed bookings block deletion without modifying the resource', async () => {
      for (const startOffset of [86400000, -3600000]) {
        const booking = await Booking.create({ user: student.user._id, resource: id, startTime: new Date(Date.now() + startOffset), endTime: new Date(Date.now() + 90000000), purpose: 'Deletion guard test' });
        const blocked = await request(`/resources/${id}`, 'DELETE', undefined, admin.token);
        assert.equal(blocked.status, 409);
        assert.match(blocked.data.error.message, /upcoming or ongoing confirmed bookings/);
        assert.equal((await Resource.findById(id)).isActive, true);
        await Booking.findByIdAndUpdate(booking._id, { status: 'cancelled' });
      }
    });
    await t.test('deletion preserves past and cancelled booking references and prevents reactivation', async () => {
      const past = await Booking.create({ user: student.user._id, resource: id, startTime: new Date(Date.now() - 7200000), endTime: new Date(Date.now() - 3600000), purpose: 'Historical reservation' });
      const removed = await request(`/resources/${id}`, 'DELETE', undefined, admin.token);
      assert.equal(removed.status, 200);
      assert.equal(removed.data.resourceId, id);
      assert.equal((await request(`/resources/${id}`, 'GET', undefined, admin.token)).status, 404);
      assert.equal((await request('/resources?includeInactive=true', 'GET', undefined, admin.token)).data.resources.some(r => r._id === id), false);
      assert.equal((await Booking.findById(past._id).populate('resource')).resource.name, input.name);
      assert.equal((await request(`/resources/${id}`, 'PUT', input, admin.token)).status, 404);
      assert.equal((await request(`/resources/${id}`, 'DELETE', undefined, admin.token)).status, 404);
    });
    await t.test('concurrent booking and deletion cannot both succeed', async () => {
      const fresh = (await request('/resources', 'POST', { ...input, name: 'Race test room' }, admin.token)).data.resource;
      const start = new Date(Date.now() + 86400000);
      const [booked, removed] = await Promise.all([
        request('/bookings', 'POST', { resource: fresh._id, startTime: start.toISOString(), endTime: new Date(+start + 3600000).toISOString(), purpose: 'Concurrent booking' }, student.token),
        request(`/resources/${fresh._id}`, 'DELETE', undefined, admin.token),
      ]);
      assert.ok((booked.status === 201 && removed.status === 409) || (booked.status === 404 && removed.status === 200), JSON.stringify({ booked, removed }));
      const referenced = await Booking.find({ resource: fresh._id }).populate('resource');
      assert.ok(referenced.every(booking => booking.resource !== null));
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
    assert.equal(mongoose.connection.name, database);
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
