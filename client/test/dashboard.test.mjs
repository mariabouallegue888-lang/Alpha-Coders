import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dashboardValues, resourceMix } from '../src/dashboard/metrics.ts';

const resources = { resources: [{}, {}, {}], pagination: { total: 17 }, typeCounts: { room: 10, lab: 5, equipment: 2 } };
const bookings = { bookings: [], summary: { all: 24, upcoming: 3, past: 19, cancelled: 2 } };
test('dashboard metrics use complete API totals rather than the loaded page length', () => {
  assert.deepEqual(dashboardValues(resources, bookings, null, false), [3, 17, 19, 2]);
});
test('admin inventory, all reservations and inactive counts come from their real API responses', () => {
  assert.deepEqual(dashboardValues(resources, bookings, { pagination: { total: 4 } }, true), [17, 3, 24, 4]);
});
test('unavailable metrics stay unknown and successful zero counts remain zero', () => {
  assert.deepEqual(dashboardValues(null, null, null, true), [null, null, null, null]);
  assert.deepEqual(dashboardValues({ ...resources, pagination: { total: 0 } }, { ...bookings, summary: { upcoming: 0, past: 0, cancelled: 0 } }, null, false), [0, 0, 0, 0]);
});
test('resource mix derives ratios from full type counts and handles empty data without NaN', () => {
  const mix = resourceMix(resources);
  assert.equal(mix[0].count, 10); assert.equal(mix[0].percent, 10 / 17 * 100);
  assert.ok(resourceMix({ ...resources, typeCounts: { room: 0, lab: 0, equipment: 0 } }).every(row => row.count === 0 && row.percent === 0));
  assert.ok(resourceMix(null).every(row => row.count === null));
});
test('core text and action tokens meet a 4.5:1 contrast ratio on their intended surfaces', () => {
  const css = readFileSync(new URL('../src/tokens.css', import.meta.url), 'utf8');
  const token = name => css.match(new RegExp(`--${name}:(#[a-f\\d]{6})`, 'i'))[1];
  function luminance(hex) {
    const components = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return components[0] * 0.2126 + components[1] * 0.7152 + components[2] * 0.0722;
  }
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const [foreground, background] of [[token('ink'), token('canvas')], [token('ink-secondary'), '#ffffff'], [token('muted'), '#ffffff'], ['#ffffff', token('accent')]]) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background}`);
});
