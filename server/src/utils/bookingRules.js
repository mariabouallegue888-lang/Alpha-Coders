import { AppError } from './errors.js';

export const MIN_DURATION_MS = 30 * 60 * 1000;
export const MAX_DURATION_MS = 4 * 60 * 60 * 1000;
// This is the single status policy for overlap, availability and deletion.
// Pending/approved are intentionally unsupported until their semantics are defined here.
export const BOOKING_STATUS_POLICY = Object.freeze({ confirmed: true, cancelled: false });
export const BLOCKING_STATUSES = Object.freeze(Object.keys(BOOKING_STATUS_POLICY).filter(status => BOOKING_STATUS_POLICY[status]));

export function validateTimes(startTime, endTime, now = new Date()) {
  const start = new Date(startTime), end = new Date(endTime);
  if (!Number.isFinite(+start) || !Number.isFinite(+end)) throw new AppError(400, 'Invalid booking dates.', 'INVALID_BOOKING_TIME');
  if (start <= now) throw new AppError(400, 'Bookings must start in the future.', 'BOOKING_START_IN_PAST');
  if (end <= start) throw new AppError(400, 'End time must be after start time.', 'INVALID_BOOKING_INTERVAL');
  if (end - start < MIN_DURATION_MS) throw new AppError(400, 'Bookings must last at least 30 minutes.', 'BOOKING_TOO_SHORT');
  if (end - start > MAX_DURATION_MS) throw new AppError(400, 'Bookings may last at most 4 hours.', 'BOOKING_TOO_LONG');
  return { start, end };
}

export const overlapFilter = (resource, start, end) => ({ resource, status: { $in: [...BLOCKING_STATUSES] }, startTime: { $lt: end }, endTime: { $gt: start } });

export function utcDayWindow(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, 'Use a real calendar date in YYYY-MM-DD format.', 'INVALID_AVAILABILITY_DATE');
  const start = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(+start) || start.toISOString().slice(0, 10) !== date) throw new AppError(400, 'Use a real calendar date in YYYY-MM-DD format.', 'INVALID_AVAILABILITY_DATE');
  return { start, end: new Date(+start + 24 * 60 * 60 * 1000) };
}

export function dayAvailability(date, bookings, now = new Date()) {
  const { start, end } = utcDayWindow(date);
  const merged = [];
  const intervals = bookings.map(booking => ({ start: Math.max(+start, +new Date(booking.startTime)), end: Math.min(+end, +new Date(booking.endTime)) })).filter(interval => interval.start < interval.end).sort((a, b) => a.start - b.start);
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push({ ...interval });
  }
  let cursor = Math.max(+start, +now);
  const free = [];
  for (const interval of merged) {
    if (interval.start - cursor >= MIN_DURATION_MS) free.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (+end - cursor >= MIN_DURATION_MS) free.push({ start: cursor, end: +end });
  const serialize = interval => ({ startTime: new Date(interval.start).toISOString(), endTime: new Date(interval.end).toISOString() });
  return { date, timeZone: 'UTC', window: { startTime: start.toISOString(), endTime: end.toISOString() }, asOf: now.toISOString(), blockingStatuses: [...BLOCKING_STATUSES], minDurationMinutes: 30, maxDurationMinutes: 240, busy: merged.map(serialize), free: free.map(serialize) };
}
