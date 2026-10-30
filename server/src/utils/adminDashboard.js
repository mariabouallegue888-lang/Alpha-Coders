export const HOUR_MS = 3600000;
export const DAY_MS = 24 * HOUR_MS;
export const RESOURCE_TYPES = ['room', 'lab', 'equipment'];

export const KPI_DEFINITIONS = Object.freeze({
  totalResources: 'Non-archived resources, including active and inactive inventory.',
  activeResources: 'Non-archived resources with isActive=true.',
  confirmedUpcomingReservations: 'Confirmed reservations with endTime > asOf; includes sessions in progress.',
  cancelledReservations: 'All reservations currently marked cancelled, regardless of reservation dates or archived resources.',
  inProgressReservations: 'Confirmed reservations with startTime <= asOf and endTime > asOf. This is scheduled time, not attendance.',
});

export function inventoryMetrics(groups) {
  const distribution = RESOURCE_TYPES.map(type => {
    const row = groups.find(group => group._id === type);
    return { type, total: row?.total || 0, active: row?.active || 0 };
  });
  const other = groups.filter(group => !RESOURCE_TYPES.includes(group._id));
  if (other.length) distribution.push({ type: 'other', total: other.reduce((sum, group) => sum + group.total, 0), active: other.reduce((sum, group) => sum + group.active, 0) });
  return { totalResources: groups.reduce((sum, group) => sum + group.total, 0), activeResources: groups.reduce((sum, group) => sum + group.active, 0), distribution };
}

export function utilizationWindow(days, asOf = new Date()) {
  if (![7, 30, 90].includes(days) || !Number.isFinite(+asOf)) throw new Error('Unsupported utilization window.');
  return { start: new Date(+asOf - days * DAY_MS), end: new Date(asOf) };
}

export function dailyScheduledHours(rows, start, end) {
  const map = new Map(rows.map(row => [row._id, row.scheduledMilliseconds / HOUR_MS]));
  const result = [], cursor = new Date(start); cursor.setUTCHours(0, 0, 0, 0);
  while (cursor < end) {
    const date = cursor.toISOString().slice(0, 10);
    result.push({ date, scheduledHours: map.get(date) || 0 }); cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

export function recentActivity(streams, limit) {
  return streams.flat().sort((a, b) => +new Date(b.at) - +new Date(a.at) || a.id.localeCompare(b.id)).slice(0, limit);
}
