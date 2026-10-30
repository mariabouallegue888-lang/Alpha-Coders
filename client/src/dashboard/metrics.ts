import type { BookingList, ResourceList } from '../api';

export function dashboardValues(resources: ResourceList | null, bookings: BookingList | null, inactive: ResourceList | null, admin: boolean): (number | null)[] {
  return admin
    ? [resources?.pagination.total ?? null, bookings?.summary.upcoming ?? null, bookings?.summary.all ?? null, inactive?.pagination.total ?? null]
    : [bookings?.summary.upcoming ?? null, resources?.pagination.total ?? null, bookings?.summary.past ?? null, bookings?.summary.cancelled ?? null];
}
export function resourceMix(resources: ResourceList | null) {
  const total = resources ? Object.values(resources.typeCounts).reduce((sum, count) => sum + count, 0) : 0;
  return (['room', 'lab', 'equipment'] as const).map(type => ({ type, count: resources?.typeCounts[type] ?? null, percent: resources && total ? resources.typeCounts[type] / total * 100 : 0 }));
}
