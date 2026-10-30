import { localDayWindow } from './time.ts';

export type ReservationGroup = 'upcoming' | 'past' | 'cancelled';
export function reservationGroup(booking: { status: string; endTime: string }, now = Date.now()): ReservationGroup {
  return booking.status === 'cancelled' ? 'cancelled' : +new Date(booking.endTime) <= now ? 'past' : 'upcoming';
}
export function canCancelBooking(booking: { user: { _id: string } | null; status: string; endTime: string }, viewer: { _id: string; role: string }, now = Date.now()): boolean {
  return booking.status === 'confirmed' && +new Date(booking.endTime) > now && (viewer.role === 'admin' || booking.user?._id === viewer._id);
}
export function dateFilterBounds(from: string, to: string): { from?: string; to?: string } {
  const start = from ? localDayWindow(from).start : null, end = to ? localDayWindow(to).end : null;
  if (start && end && start >= end) throw new Error('Choose an end date on or after the start date.');
  return { ...(start ? { from: start.toISOString() } : {}), ...(end ? { to: end.toISOString() } : {}) };
}
export function bookingDateLabel(value: string): string {
  return new Date(value).toLocaleString([], { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'shortOffset' });
}
