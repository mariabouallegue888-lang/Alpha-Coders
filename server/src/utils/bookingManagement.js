import { AppError } from './errors.js';

export function assertCancellationAllowed(booking, user, now = new Date()) {
  if (!booking) throw new AppError(404, 'Booking not found.', 'BOOKING_NOT_FOUND');
  if (!user?._id) throw new AppError(401, 'Please sign in to continue.', 'AUTHENTICATION_REQUIRED');
  // Ownership is checked even for cancelled history, before returning any state.
  if (user.role !== 'admin' && String(booking.user) !== String(user._id)) throw new AppError(403, 'You can only cancel your own bookings.', 'BOOKING_FORBIDDEN');
  if (booking.status === 'cancelled') return false;
  if (booking.status !== 'confirmed') throw new AppError(400, 'This booking cannot be cancelled.', 'BOOKING_NOT_CANCELLABLE');
  if (new Date(booking.endTime) <= now) throw new AppError(400, 'Past bookings cannot be cancelled.', 'BOOKING_ALREADY_ENDED');
  return true;
}

export function bookingSelectionFilter(query, now) {
  const parts = [];
  if (query.status) parts.push({ status: query.status });
  if (query.period === 'upcoming') parts.push({ status: 'confirmed', endTime: { $gt: now } });
  if (query.period === 'past') parts.push({ status: 'confirmed', endTime: { $lte: now } });
  if (query.period === 'cancelled') parts.push({ status: 'cancelled' });
  return parts.length ? { $and: parts } : {};
}

export function bookingBaseFilter(query, ownerId) {
  return {
    ...(ownerId ? { user: ownerId } : {}),
    ...(query.resource ? { resource: query.resource } : {}),
    ...(query.from ? { endTime: { $gt: new Date(query.from) } } : {}),
    ...(query.to ? { startTime: { $lt: new Date(query.to) } } : {}),
  };
}

export function bookingSearchFilter(search, admin) {
  if (!search) return {};
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fields = ['purpose', 'resource.name', 'resource.location', ...(admin ? ['user.name', 'user.email'] : [])];
  return { $or: fields.map(field => ({ [field]: { $regex: escaped, $options: 'i' } })) };
}
