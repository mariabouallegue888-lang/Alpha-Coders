import { BLOCKING_STATUSES } from './bookingRules.js';

export function isSafeImageUrl(value) {
  if (value === '') return true;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function visibilityFilter({ includeInactive, isActive }, isAdmin) {
  const filter = { deletedAt: null };
  if (!isAdmin || (includeInactive !== 'true' && isActive !== 'false')) filter.isActive = true;
  if (isAdmin && isActive !== undefined) filter.isActive = isActive === 'true';
  return filter;
}

export function resourceFilter(query, isAdmin) {
  const filter = visibilityFilter(query, isAdmin);
  if (query.type) filter.type = query.type;
  if (query.search) {
    const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = ['name', 'location', 'description'].map(field => ({ [field]: { $regex: escaped, $options: 'i' } }));
  }
  return filter;
}

// Include bookings already in progress; an ended or cancelled booking cannot block removal.
export const futureBookingFilter = (resource, now = new Date()) => ({ resource, status: { $in: [...BLOCKING_STATUSES] }, endTime: { $gt: now } });
