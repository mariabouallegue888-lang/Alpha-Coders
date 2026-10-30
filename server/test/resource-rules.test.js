import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeImageUrl, visibilityFilter, resourceFilter, futureBookingFilter } from '../src/utils/resourceRules.js';

test('image URLs permit HTTP(S) or empty and reject executable schemes and credentials', () => {
  for (const value of ['', 'https://example.edu/room.jpg', 'http://localhost/image.png']) assert.equal(isSafeImageUrl(value), true);
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml,bad', 'file:///photo.jpg', 'not a url', 'https://user:secret@example.edu/image.jpg', '//example.edu/photo.jpg']) assert.equal(isSafeImageUrl(value), false);
});
test('regular visibility cannot be widened and every listing excludes archived resources', () => {
  assert.deepEqual(visibilityFilter({ includeInactive: 'true', isActive: 'false' }, false), { deletedAt: null, isActive: true });
  assert.deepEqual(visibilityFilter({ includeInactive: 'true' }, true), { deletedAt: null });
  assert.deepEqual(visibilityFilter({ includeInactive: 'true', isActive: 'false' }, true), { deletedAt: null, isActive: false });
});
test('search treats regex operators literally and searches each supported field', () => {
  const filter = resourceFilter({ search: 'Room [A] (.*)', type: 'room' }, false);
  assert.equal(filter.type, 'room');
  assert.equal(filter.$or.length, 3);
  const regex = new RegExp(filter.$or[0].name.$regex, 'i');
  assert.equal(regex.test('Room [A] (.*)'), true);
  assert.equal(regex.test('Room A anything'), false);
});
test('deletion guard covers upcoming and in-progress confirmed bookings', () => {
  const now = new Date('2030-01-01T12:00:00Z');
  assert.deepEqual(futureBookingFilter('resource-id', now), { resource: 'resource-id', status: { $in: ['confirmed'] }, endTime: { $gt: now } });
});
