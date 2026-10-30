import test from 'node:test';
import assert from 'node:assert/strict';
import { distributionStops, usageChartPoints } from '../src/dashboard/adminCharts.ts';

test('distribution chart uses actual totals, including zeros', () => {
  assert.deepEqual(distributionStops([{ total: 3 }, { total: 0 }, { total: 1 }]), [{ start: 0, end: 75 }, { start: 75, end: 75 }, { start: 75, end: 100 }]);
  assert.deepEqual(distributionStops([{ total: 0 }]), [{ start: 0, end: 0 }]);
});
test('usage chart handles no data and a single zero without invalid coordinates', () => {
  assert.deepEqual(usageChartPoints([]).points, []);
  const chart = usageChartPoints([{ date: '2030-01-01', scheduledHours: 0 }]);
  assert.equal(chart.points[0].y, chart.bottom);
  assert.equal(chart.points[0].x, chart.left);
});
test('usage chart scales fractional scheduled hours and preserves exact values', () => {
  const rows = [{ date: '2030-01-01', scheduledHours: 0.5 }, { date: '2030-01-02', scheduledHours: 2 }];
  const chart = usageChartPoints(rows);
  assert.equal(chart.max, 2);
  assert.equal(chart.points[1].x, chart.right);
  assert.equal(chart.points[1].y, chart.top);
  assert.equal(chart.points[0].scheduledHours, 0.5);
});
