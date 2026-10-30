import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { reservationGroup, canCancelBooking, dateFilterBounds } from '../src/booking/myBookings.ts';

const now = Date.parse('2030-01-02T12:00:00Z');
const owner = { _id: 'owner-id', role: 'user' }, stranger = { _id: 'other-id', role: 'user' }, admin = { _id: 'admin-id', role: 'admin' };
const booking = { user: { _id: owner._id }, status: 'confirmed', endTime: '2030-01-02T13:00:00Z' };
test('reservation groups distinguish upcoming, ended and cancelled history', () => {
  assert.equal(reservationGroup(booking, now), 'upcoming');
  assert.equal(reservationGroup({ ...booking, endTime: '2030-01-02T12:00:00Z' }, now), 'past');
  assert.equal(reservationGroup({ ...booking, status: 'cancelled' }, now), 'cancelled');
  assert.equal(reservationGroup({ ...booking, status: 'cancelled', endTime: '2020-01-01' }, now), 'cancelled');
});
test('cancel controls appear for the owner and admin but never another member', () => {
  assert.equal(canCancelBooking(booking, owner, now), true);
  assert.equal(canCancelBooking(booking, admin, now), true);
  assert.equal(canCancelBooking(booking, stranger, now), false);
});
test('ended and already-cancelled bookings never offer a cancel control', () => {
  assert.equal(canCancelBooking({ ...booking, status: 'cancelled' }, owner, now), false);
  assert.equal(canCancelBooking({ ...booking, endTime: '2030-01-02T12:00:00Z' }, admin, now), false);
  assert.equal(canCancelBooking({ ...booking, user: null }, owner, now), false);
});
test('date filters reject inverted ranges and allow an inclusive single day', () => {
  assert.throws(() => dateFilterBounds('2030-01-03', '2030-01-02'));
  const bounds = dateFilterBounds('2030-01-02', '2030-01-02');
  assert.ok(new Date(bounds.from) < new Date(bounds.to));
  assert.deepEqual(dateFilterBounds('', ''), {});
});
test('local date filters handle a 23-hour DST day without adding a fixed 24 hours', () => {
  const url = new URL('../src/booking/myBookings.ts', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import assert from 'node:assert/strict'; import {dateFilterBounds} from ${JSON.stringify(url)}; const b=dateFilterBounds('2026-03-29','2026-03-29'); assert.equal(new Date(b.to)-new Date(b.from),23*3600000);`], { env: { ...process.env, TZ: 'Europe/London' }, encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
});
