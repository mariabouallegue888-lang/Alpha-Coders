import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCancellationAllowed, bookingBaseFilter, bookingSearchFilter, bookingSelectionFilter } from '../src/utils/bookingManagement.js';

const now = new Date('2030-01-02T12:00:00Z');
const owner = { _id: 'owner-id', role: 'user' }, stranger = { _id: 'other-id', role: 'user' }, admin = { _id: 'admin-id', role: 'admin' };
const future = { user: owner._id, status: 'confirmed', endTime: new Date('2030-01-02T13:00:00Z') };
test('only an owner or administrator may cancel a confirmed reservation', () => {
  assert.equal(assertCancellationAllowed(future, owner, now), true);
  assert.equal(assertCancellationAllowed(future, admin, now), true);
  assert.throws(() => assertCancellationAllowed(future, stranger, now), { status: 403, code: 'BOOKING_FORBIDDEN' });
});
test('already-cancelled history is idempotent for its owner but still private', () => {
  const cancelled = { ...future, status: 'cancelled', endTime: new Date('2020-01-01') };
  assert.equal(assertCancellationAllowed(cancelled, owner, now), false);
  assert.throws(() => assertCancellationAllowed(cancelled, stranger, now), { status: 403 });
});
test('past confirmed reservations are preserved and cannot be cancelled', () => {
  assert.throws(() => assertCancellationAllowed({ ...future, endTime: now }, owner, now), { status: 400, code: 'BOOKING_ALREADY_ENDED' });
  assert.equal(assertCancellationAllowed(future, owner, now), true);
});
test('missing records, missing authentication and unsupported statuses have explicit errors', () => {
  assert.throws(() => assertCancellationAllowed(null, owner, now), { status: 404 });
  assert.throws(() => assertCancellationAllowed(future, null, now), { status: 401 });
  assert.throws(() => assertCancellationAllowed({ ...future, status: 'pending' }, owner, now), { code: 'BOOKING_NOT_CANCELLABLE' });
});
test('personal ownership filters cannot be widened by a client-supplied user', () => {
  assert.deepEqual(bookingBaseFilter({ user: 'someone-else' }, owner._id), { user: owner._id });
});
test('date filters use exclusive interval endpoints so boundary-only matches are excluded', () => {
  assert.deepEqual(bookingBaseFilter({ resource: 'room-id', from: '2030-01-01T00:00:00Z', to: '2030-01-03T00:00:00Z' }, owner._id), {
    user: owner._id, resource: 'room-id', endTime: { $gt: new Date('2030-01-01T00:00:00Z') }, startTime: { $lt: new Date('2030-01-03T00:00:00Z') },
  });
});
test('upcoming includes in-progress bookings and past includes the exact end boundary', () => {
  assert.deepEqual(bookingSelectionFilter({ period: 'upcoming' }, now), { $and: [{ status: 'confirmed', endTime: { $gt: now } }] });
  assert.deepEqual(bookingSelectionFilter({ period: 'past' }, now), { $and: [{ status: 'confirmed', endTime: { $lte: now } }] });
  assert.deepEqual(bookingSelectionFilter({ period: 'cancelled' }, now), { $and: [{ status: 'cancelled' }] });
});
test('search escapes regex input and searches member details only in the admin list', () => {
  const filter = bookingSearchFilter('[Study].*', false);
  assert.equal(filter.$or.length, 3);
  assert.equal(bookingSearchFilter('member', true).$or.length, 5);
  const regex = new RegExp(filter.$or[0].purpose.$regex, 'i');
  assert.equal(regex.test('[Study].*'), true);
  assert.equal(regex.test('Study anything'), false);
});
