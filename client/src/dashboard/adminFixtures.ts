// Test fixtures only. Production dashboards always request the authorized backend.
import type { AdminDashboard, ResourceUtilization } from '../api';

export const adminOverviewFixture: AdminDashboard = {
  asOf: '2030-01-31T12:00:00Z',
  kpis: { totalResources: 7, activeResources: 4, confirmedUpcomingReservations: 2, cancelledReservations: 1, inProgressReservations: 1 },
  definitions: { totalResources: 'Non-archived inventory.', activeResources: 'Active non-archived inventory.', confirmedUpcomingReservations: 'Confirmed reservations with time remaining.', cancelledReservations: 'All-time cancelled reservations.' },
  resourceDistribution: [{ type: 'room', total: 4, active: 3 }, { type: 'lab', total: 2, active: 1 }, { type: 'equipment', total: 1, active: 0 }],
  upcomingBookings: [{ _id: 'reservation-one', resource: { _id: 'room-one', name: 'Library Studio', type: 'room', location: 'North Library', isActive: true }, user: { _id: 'member-one', name: 'Taylor Student', email: 'taylor@campus.edu' }, startTime: '2030-01-31T11:00:00Z', endTime: '2030-01-31T13:00:00Z', purpose: 'Thesis discussion', status: 'confirmed' }],
  recentActivity: [{ id: 'booking_cancelled:one', kind: 'booking_cancelled', at: '2030-01-31T10:00:00Z', bookingId: 'one', resource: { _id: 'room-one', name: 'Library Studio', type: 'room', location: 'North Library', isActive: true }, user: { _id: 'member-one', name: 'Taylor Student', email: 'taylor@campus.edu' } }],
  activityNote: 'Recorded events; owners are not necessarily cancellation actors.',
};
export const adminUsageFixture: ResourceUtilization = {
  asOf: '2030-01-31T12:00:00Z', window: { days: 30, start: '2030-01-01T12:00:00Z', end: '2030-01-31T12:00:00Z', timeZone: 'UTC' }, measurement: 'confirmed_scheduled_hours',
  scheduledHours: 1.5, bookingCount: 1, resourcesUsed: 1, utilizationPercent: null, limitations: 'Attendance and opening hours are not recorded.',
  daily: [{ date: '2030-01-30', scheduledHours: 0 }, { date: '2030-01-31', scheduledHours: 1.5 }],
  topResources: [{ resourceId: 'room-one', resource: { _id: 'room-one', name: 'Library Studio', type: 'room', isActive: true }, scheduledHours: 1.5, bookingCount: 1 }],
};
