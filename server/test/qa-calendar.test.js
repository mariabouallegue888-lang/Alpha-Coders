import test from 'node:test';
import assert from 'node:assert/strict';
import { testCalendar } from './helpers/integration.js';

test('acceptance calendar provides stable future UTC wall times without freezing the API clock', () => {
  const calendar = testCalendar(new Date('2026-12-31T23:59:59Z'));
  assert.equal(calendar.day, '2027-01-15');
  assert.equal(calendar.at(10), '2027-01-15T10:00:00.000Z');
  assert.equal(calendar.at(12.5, 1), '2027-01-16T12:30:00.000Z');
  assert.ok(+new Date(calendar.at(0)) > +new Date('2026-12-31T23:59:59Z'));
});
