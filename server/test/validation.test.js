import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, bookingSchema, registerSchema, resourceSchema, resourceQuerySchema, myBookingQuerySchema, adminBookingQuerySchema, adminDashboardQuerySchema, utilizationQuerySchema } from '../src/utils/validation.js';

test('admin dashboard queries enforce strict bounded windows and result sizes', () => {
  assert.deepEqual(parse(adminDashboardQuerySchema, {}), { upcomingLimit: 6, activityLimit: 8 });
  assert.deepEqual(parse(utilizationQuerySchema, {}), { days: 30, limit: 5 });
  assert.deepEqual(parse(utilizationQuerySchema, { days: '90', limit: '10' }), { days: 90, limit: 10 });
  for (const value of [{ upcomingLimit: '0' }, { activityLimit: '21' }, { upcomingLimit: ['2'] }, { role: 'admin' }]) assert.throws(() => parse(adminDashboardQuerySchema, value), { status: 400 });
  for (const value of [{ days: '31' }, { days: '7.0' }, { limit: '11' }, { limit: '-1' }, { days: ['7'] }, { unknown: '1' }]) assert.throws(() => parse(utilizationQuerySchema, value), { status: 400 });
});

test('registration normalizes email and strips privilege escalation fields', () => {
  const value = parse(registerSchema, { name: ' Test User ', email: 'USER@campus.edu', password: 'password123', role: 'admin' });
  assert.equal(value.email, 'user@campus.edu');
  assert.equal(value.name, 'Test User');
  assert.equal(value.role, undefined);
});
test('validation blocks invalid references, image schemes, capacities and bcrypt truncation', () => {
  assert.throws(() => parse(bookingSchema, { resource: 'invalid', startTime: 'today', endTime: 'tomorrow', purpose: 'ok' }), { status: 400 });
  assert.throws(() => parse(resourceSchema, { name: 'Room', type: 'room', capacity: 0, location: 'Main', imageUrl: 'javascript:alert(1)' }), { status: 400 });
  assert.throws(() => parse(registerSchema, { name: 'User', email: 'user@campus.edu', password: '🔒'.repeat(20) }), { status: 400 });
});
test('a partial resource update does not reset omitted defaults', () => {
  assert.deepEqual(parse(resourceSchema.partial(), { name: 'New room name' }), { name: 'New room name' });
});
test('resource pagination validates bounded positive integers and allowed filters', () => {
  assert.deepEqual(parse(resourceQuerySchema, {}), { page: 1, limit: 12 });
  assert.equal(parse(resourceQuerySchema, { page: '2', limit: '100' }).page, 2);
  for (const query of [{ page: '0' }, { page: '-1' }, { page: '1.5' }, { page: '1e5' }, { limit: '101' }, { limit: ['2'] }, { isActive: 'all' }, { type: 'office' }]) assert.throws(() => parse(resourceQuerySchema, query), { status: 400 });
});
test('booking list filters validate identities, statuses, pagination and date ranges', () => {
  assert.equal(parse(myBookingQuerySchema, {}).period, 'all');
  for (const query of [{ user: '012345678901234567890123' }, { scope: 'all' }, { status: 'pending' }, { resource: 'bad-id' }, { limit: '101' }, { from: '2030-01-03T00:00:00Z', to: '2030-01-02T00:00:00Z' }]) assert.throws(() => parse(myBookingQuerySchema, query), { status: 400 });
  assert.equal(parse(adminBookingQuerySchema, { user: '012345678901234567890123' }).user, '012345678901234567890123');
});
