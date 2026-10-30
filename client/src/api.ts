export interface User { _id: string; name: string; email: string; role: 'user' | 'admin'; createdAt: string }
export interface Resource { _id: string; name: string; type: 'room' | 'lab' | 'equipment'; capacity: number; location: string; description: string; imageUrl: string; isActive: boolean }
export interface Booking { _id: string; user: Pick<User, '_id' | 'name' | 'email'> | null; resource: Resource | null; startTime: string; endTime: string; purpose: string; status: 'confirmed' | 'cancelled'; createdAt?: string; cancelledAt?: string | null }
export interface Session { user: User; token: string }
export interface Pagination { page: number; limit: number; total: number; totalPages: number; hasNextPage: boolean; hasPreviousPage: boolean }
export interface BookingList { bookings: Booking[]; pagination: Pagination; summary: Record<'all' | 'upcoming' | 'past' | 'cancelled', number>; asOf: string }
export interface AdminDashboard {
  asOf: string;
  kpis: { totalResources: number; activeResources: number; confirmedUpcomingReservations: number; cancelledReservations: number; inProgressReservations: number };
  definitions: Record<string, string>;
  resourceDistribution: { type: 'room' | 'lab' | 'equipment' | 'other'; total: number; active: number }[];
  upcomingBookings: (Omit<Booking, 'resource'> & { resource: Pick<Resource, '_id' | 'name' | 'type' | 'location' | 'isActive'> | null })[];
  recentActivity: { id: string; kind: 'booking_created' | 'booking_cancelled' | 'resource_created' | 'resource_archived'; at: string; bookingId?: string; resource: Pick<Resource, '_id' | 'name' | 'type' | 'location' | 'isActive'> | null; user: Pick<User, '_id' | 'name' | 'email'> | null }[];
  activityNote: string;
}
export interface ResourceUtilization {
  asOf: string; window: { days: number; start: string; end: string; timeZone: 'UTC' }; measurement: 'confirmed_scheduled_hours';
  scheduledHours: number; bookingCount: number; resourcesUsed: number; utilizationPercent: null; limitations: string;
  topResources: { resourceId: string; resource: Pick<Resource, '_id' | 'name' | 'type' | 'isActive'> | null; bookingCount: number; scheduledHours: number }[];
  daily: { date: string; scheduledHours: number }[];
}
export interface ResourceList { resources: Resource[]; pagination: Pagination; typeCounts: Record<Resource['type'], number> }
export interface DayAvailability { date: string; timeZone: 'UTC'; window: { startTime: string; endTime: string }; asOf: string; busy: { startTime: string; endTime: string }[]; free: { startTime: string; endTime: string }[]; minDurationMinutes: number; maxDurationMinutes: number }
export class ApiError extends Error {
  constructor(message: string, public status: number, public details: { field: string; message: string }[] = [], public code = 'REQUEST_FAILED', public meta?: Record<string, unknown>) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  try {
    response = await fetch(`/api${path}`, { ...options, headers });
  } catch { throw new Error('Cannot reach the server. Check your connection and try again.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && token) window.dispatchEvent(new CustomEvent('session-expired', { detail: token }));
    const details = data?.error?.details?.map((d: { field: string; message: string }) => `${d.field}: ${d.message}`).join(' ');
    throw new ApiError(details || data?.error?.message || 'The server could not complete your request.', response.status, data?.error?.details || [], data?.error?.code, data?.error?.meta);
  }
  if (data === null) throw new ApiError('The server returned an unreadable response. Refresh to check the result before repeating an action.', response.status, [], 'INVALID_RESPONSE');
  return data as T;
}
