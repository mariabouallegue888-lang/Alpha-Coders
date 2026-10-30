import test from 'node:test';
import assert from 'node:assert/strict';
import { inventoryMetrics, utilizationWindow, dailyScheduledHours, recentActivity, HOUR_MS, DAY_MS } from '../src/utils/adminDashboard.js';

test('inventory counts every current resource and reports active counts separately', () => {
  const result = inventoryMetrics([{ _id: 'room', total: 9, active: 7 }, { _id: 'lab', total: 2, active: 0 }]);
  assert.equal(result.totalResources, 11);
  assert.equal(result.activeResources, 7);
  assert.deepEqual(result.distribution, [{ type: 'room', total: 9, active: 7 }, { type: 'lab', total: 2, active: 0 }, { type: 'equipment', total: 0, active: 0 }]);
});
test('empty inventory returns true zeros and legacy types are not silently discarded', () => {
  assert.equal(inventoryMetrics([]).totalResources, 0);
  const result = inventoryMetrics([{ _id: 'legacy', total: 2, active: 1 }]);
  assert.equal(result.totalResources, 2);
  assert.deepEqual(result.distribution.at(-1), { type: 'other', total: 2, active: 1 });
});
test('utilization windows are bounded elapsed UTC intervals, independent of DST', () => {
  const end = new Date('2026-10-30T12:30:00Z');
  for (const days of [7, 30, 90]) {
    const window = utilizationWindow(days, end);
    assert.equal(+window.end - +window.start, days * DAY_MS);
    assert.equal(+window.end, +end);
  }
  for (const days of [0, 1, 91, '30']) assert.throws(() => utilizationWindow(days, end));
  assert.throws(() => utilizationWindow(7, new Date('invalid')));
});
test('daily chart fills missing days without extending an exclusive midnight end', () => {
  const days = dailyScheduledHours([{ _id: '2030-01-25', scheduledMilliseconds: 1.5 * HOUR_MS }], new Date('2030-01-24T12:00Z'), new Date('2030-01-27T00:00Z'));
  assert.deepEqual(days, [{ date: '2030-01-24', scheduledHours: 0 }, { date: '2030-01-25', scheduledHours: 1.5 }, { date: '2030-01-26', scheduledHours: 0 }]);
});
test('partial last UTC day is represented and empty aggregate has zero recorded hours', () => {
  const rows = dailyScheduledHours([], new Date('2030-01-24T12:00Z'), new Date('2030-01-31T12:00Z'));
  assert.equal(rows.length, 8);
  assert.equal(rows.at(-1).date, '2030-01-31');
  assert.equal(rows.reduce((sum, row) => sum + row.scheduledHours, 0), 0);
});
test('activity merges actual event streams into one bounded, stable timeline', () => {
  const a = { id: 'a', at: '2030-01-01T00:00Z' }, b = { id: 'b', at: '2030-01-02T00:00Z' }, c = { id: 'c', at: b.at };
  assert.deepEqual(recentActivity([[a, c], [], [b]], 2), [b, c]);
  assert.deepEqual(recentActivity([], 8), []);
});
