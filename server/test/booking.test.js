import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTimes, overlapFilter, BLOCKING_STATUSES, BOOKING_STATUS_POLICY, utcDayWindow, dayAvailability } from '../src/utils/bookingRules.js';

const now = new Date('2030-01-01T00:00:00Z');
test('accepts a future interval and preserves instants across offsets', () => {
  const { start, end } = validateTimes('2030-01-02T12:00:00+01:00', '2030-01-02T13:00:00+01:00', now);
  assert.equal(start.toISOString(), '2030-01-02T11:00:00.000Z');
  assert.equal(end - start, 3600000);
});
test('rejects past, inverted, malformed and excessive bookings', () => {
  for (const times of [ ['2020-01-01', '2020-01-02'], ['2030-01-02', '2030-01-01'], ['bad', 'bad'], ['2030-01-02', '2030-01-04'] ]) {
    assert.throws(() => validateTimes(...times, now), { status: 400 });
  }
});
test('conflict query uses exclusive endpoints so adjacent bookings are allowed', () => {
  const start = new Date('2030-01-02'), end = new Date('2030-01-03');
  assert.deepEqual(overlapFilter('resource-id', start, end), { resource: 'resource-id', status: { $in: ['confirmed'] }, startTime: { $lt: end }, endTime: { $gt: start } });
});
test('accepts exact 30 minute and 4 hour boundaries; rejects durations outside them', () => {
  const start = new Date('2030-01-02');
  for (const duration of [1800000, 14400000]) assert.equal(validateTimes(start, new Date(+start + duration), now).end - start, duration);
  assert.throws(() => validateTimes(start, new Date(+start + 1799999), now), { code: 'BOOKING_TOO_SHORT' });
  assert.throws(() => validateTimes(start, new Date(+start + 14400001), now), { code: 'BOOKING_TOO_LONG' });
  assert.throws(() => validateTimes('2030-01-02', '2030-01-02', now), { status: 400 });
});
test('status policy blocks confirmed only, with approval statuses intentionally unsupported', () => {
  assert.deepEqual(BLOCKING_STATUSES, ['confirmed']);
  assert.deepEqual(BOOKING_STATUS_POLICY, { confirmed: true, cancelled: false });
});
test('availability dates reject rollover dates, arrays and invalid formats', () => {
  for (const date of ['2030-02-30', '2030-13-01', '2030-1-01', ['2030-01-02'], undefined]) assert.throws(() => utcDayWindow(date), { code: 'INVALID_AVAILABILITY_DATE' });
  assert.equal(utcDayWindow('2032-02-29').start.toISOString(), '2032-02-29T00:00:00.000Z');
});
test('day availability clips midnight crossings, merges busy intervals, and omits short gaps', () => {
  const availability = dayAvailability('2030-01-02', [
    { startTime: '2030-01-01T23:00:00Z', endTime: '2030-01-02T01:00:00Z' },
    { startTime: '2030-01-02T01:00:00Z', endTime: '2030-01-02T02:00:00Z' },
    { startTime: '2030-01-02T02:15:00Z', endTime: '2030-01-02T03:00:00Z' },
    { startTime: '2030-01-02T23:00:00Z', endTime: '2030-01-03T01:00:00Z' },
  ], now);
  assert.equal(availability.busy[0].endTime, '2030-01-02T02:00:00.000Z');
  assert.deepEqual(availability.free, [{ startTime: '2030-01-02T03:00:00.000Z', endTime: '2030-01-02T23:00:00.000Z' }]);
  assert.equal(availability.busy.at(-1).endTime, '2030-01-03T00:00:00.000Z');
});
test('availability omits past time and does not emit a gap under 30 minutes', () => {
  assert.deepEqual(dayAvailability('2030-01-02', [], new Date('2030-01-02T23:45:00Z')).free, []);
  assert.deepEqual(dayAvailability('2020-01-02', [], now).free, []);
});
