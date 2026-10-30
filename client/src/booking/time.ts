export interface Interval { startTime: string; endTime: string }
export interface BookingDraft { date: string; startTime: string; endTime: string; purpose: string }
export const MINUTES = 60000;
export const MIN_DURATION = 30 * MINUTES;
export const MAX_DURATION = 240 * MINUTES;

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function localDayWindow(value: string): { start: Date; end: Date } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Choose a valid date.');
  const [year, month, day] = value.split('-').map(Number);
  const start = new Date(year, month - 1, day);
  if (!Number.isFinite(+start) || localDate(start) !== value) throw new Error('Choose a valid date.');
  return { start, end: new Date(year, month - 1, day + 1) };
}
export function utcDatesForLocalDay(value: string): string[] {
  const { start, end } = localDayWindow(value);
  // Include four hours after midnight so overnight end-time choices are covered.
  const cursor = new Date(start); cursor.setUTCHours(0, 0, 0, 0);
  const dates: string[] = [];
  while (+cursor < +end + MAX_DURATION) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return dates;
}
export function overlaps(startTime: string, endTime: string, busy: Interval[]): boolean {
  const start = +new Date(startTime), end = +new Date(endTime);
  return busy.some(interval => +new Date(interval.startTime) < end && +new Date(interval.endTime) > start);
}
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter(interval => +new Date(interval.startTime) < +new Date(interval.endTime)).map(interval => ({ start: +new Date(interval.startTime), end: +new Date(interval.endTime) })).sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const interval of sorted) { const last = merged.at(-1); if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end); else merged.push({ ...interval }); }
  return merged.map(interval => ({ startTime: new Date(interval.start).toISOString(), endTime: new Date(interval.end).toISOString() }));
}
export function intervalsForLocalDay(date: string, busy: Interval[]): Interval[] {
  const { start, end } = localDayWindow(date);
  return mergeIntervals(busy.map(interval => ({ startTime: new Date(Math.max(+start, +new Date(interval.startTime))).toISOString(), endTime: new Date(Math.min(+end, +new Date(interval.endTime))).toISOString() })));
}
export function openWindows(date: string, busy: Interval[], now = Date.now()): Interval[] {
  const { start, end } = localDayWindow(date);
  let cursor = Math.max(+start, Math.ceil(now / MINUTES) * MINUTES);
  const free: Interval[] = [];
  for (const interval of intervalsForLocalDay(date, busy)) {
    const begins = +new Date(interval.startTime), ends = +new Date(interval.endTime);
    if (begins - cursor >= MIN_DURATION) free.push({ startTime: new Date(cursor).toISOString(), endTime: interval.startTime });
    cursor = Math.max(cursor, ends);
  }
  if (+end - cursor >= MIN_DURATION) free.push({ startTime: new Date(cursor).toISOString(), endTime: end.toISOString() });
  return free;
}
export function startChoices(date: string, busy: Interval[]): string[] {
  const { start, end } = localDayWindow(date), choices = new Set<number>();
  for (let instant = +start; instant < +end; instant += 15 * MINUTES) choices.add(instant);
  // Preserve exact adjacency even when a reservation ends off the quarter hour.
  for (const interval of busy) { const instant = +new Date(interval.endTime); if (instant >= +start && instant < +end) choices.add(instant); }
  return [...choices].sort((a, b) => a - b).map(instant => new Date(instant).toISOString());
}
export function endChoices(startTime: string, busy: Interval[]): string[] {
  const start = +new Date(startTime); if (!Number.isFinite(start)) return [];
  const choices = new Set<number>();
  for (let duration = MIN_DURATION; duration <= MAX_DURATION; duration += 15 * MINUTES) choices.add(start + duration);
  for (const interval of busy) { const instant = +new Date(interval.startTime); if (instant - start >= MIN_DURATION && instant - start <= MAX_DURATION) choices.add(instant); }
  return [...choices].sort((a, b) => a - b).map(instant => new Date(instant).toISOString());
}
export function validateDraft(draft: BookingDraft, now = Date.now()): Record<string, string> {
  const errors: Record<string, string> = {};
  try { localDayWindow(draft.date); } catch { errors.date = 'Choose a valid date.'; }
  const start = +new Date(draft.startTime), end = +new Date(draft.endTime);
  if (!Number.isFinite(start)) errors.startTime = 'Choose a start time.';
  else if (localDate(new Date(start)) !== draft.date) errors.startTime = 'Choose a start time on the selected date.';
  else if (start <= now) errors.startTime = 'Choose a start time in the future.';
  if (!Number.isFinite(end)) errors.endTime = 'Choose an end time.';
  else if (Number.isFinite(start)) {
    if (end <= start) errors.endTime = 'End time must be after start time.';
    else if (end - start < MIN_DURATION) errors.endTime = 'Reserve for at least 30 minutes.';
    else if (end - start > MAX_DURATION) errors.endTime = 'Reserve for no more than 4 hours.';
  }
  if (draft.purpose.trim().length < 3) errors.purpose = 'Tell us your purpose in at least 3 characters.';
  else if (draft.purpose.trim().length > 500) errors.purpose = 'Keep your purpose to 500 characters.';
  return errors;
}
export function bookingPayload(resource: string, draft: BookingDraft, now = Date.now()) {
  const errors = validateDraft(draft, now);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return { resource, startTime: new Date(draft.startTime).toISOString(), endTime: new Date(draft.endTime).toISOString(), purpose: draft.purpose.trim() };
}
export function durationLabel(start: string, end: string): string {
  const minutes = Math.round((+new Date(end) - +new Date(start)) / MINUTES);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  return [minutes >= 60 ? `${Math.floor(minutes / 60)} hr` : '', minutes % 60 ? `${minutes % 60} min` : ''].filter(Boolean).join(' ');
}
export function timeLabel(value: string, includeDate = false): string {
  const date = new Date(value);
  return date.toLocaleString([], { ...(includeDate ? { month: 'short', day: 'numeric' } as const : {}), hour: '2-digit', minute: '2-digit', ...(date.getSeconds() || date.getMilliseconds() ? { second: '2-digit' } as const : {}), ...(date.getMilliseconds() ? { fractionalSecondDigits: 3 } as const : {}), timeZoneName: 'shortOffset' });
}
