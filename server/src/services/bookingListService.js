import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';
import { Resource } from '../models/Resource.js';
import { User } from '../models/User.js';
import { bookingBaseFilter, bookingSearchFilter, bookingSelectionFilter } from '../utils/bookingManagement.js';

// An ownership match precedes all joins, search, pagination and summary counts.
// Admin callers are authorized in the route before reaching this service.
export async function listBookings(query, owner = null) {
  const now = new Date();
  const ownerId = owner ? owner._id : query.user ? new mongoose.Types.ObjectId(query.user) : null;
  const filter = bookingBaseFilter({ ...query, resource: query.resource ? new mongoose.Types.ObjectId(query.resource) : undefined }, ownerId);
  const selected = bookingSelectionFilter(query, now);
  const direction = query.sort === 'startAsc' || (!query.sort && query.period === 'upcoming') ? 1 : -1;
  const [result] = await Booking.aggregate([
    { $match: filter },
    { $lookup: { from: Resource.collection.name, localField: 'resource', foreignField: '_id', pipeline: [{ $project: { name: 1, type: 1, capacity: 1, location: 1, description: 1, imageUrl: 1, isActive: 1 } }], as: 'resource' } },
    { $unwind: { path: '$resource', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: User.collection.name, localField: 'user', foreignField: '_id', pipeline: [{ $project: { name: 1, email: 1 } }], as: 'user' } },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    { $match: bookingSearchFilter(query.search, !owner) },
    ...(query.type ? [{ $match: { 'resource.type': query.type } }] : []),
    { $facet: {
      bookings: [
        { $match: selected }, { $sort: { startTime: direction, _id: direction } }, { $skip: (query.page - 1) * query.limit }, { $limit: query.limit },
        { $project: { user: { $ifNull: ['$user', null] }, resource: { $ifNull: ['$resource', null] }, startTime: 1, endTime: 1, purpose: 1, status: 1, rejectionReason: 1, createdAt: 1, cancelledAt: { $ifNull: ['$cancelledAt', null] } } },
      ],
      total: [{ $match: selected }, { $count: 'value' }],
      summary: [{ $group: { _id: null, all: { $sum: 1 },
        upcoming: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'confirmed'] }, { $gt: ['$endTime', now] }] }, 1, 0] } },
        past: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'confirmed'] }, { $lte: ['$endTime', now] }] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
      } }],
    } },
  ]).option({ maxTimeMS: 5000 });
  const total = result?.total[0]?.value || 0, totalPages = Math.ceil(total / query.limit);
  const counts = result?.summary[0];
  return {
    bookings: result?.bookings || [], asOf: now.toISOString(),
    pagination: { page: query.page, limit: query.limit, total, totalPages, hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1 && totalPages > 0 },
    summary: { all: counts?.all || 0, upcoming: counts?.upcoming || 0, past: counts?.past || 0, cancelled: counts?.cancelled || 0 },
  };
}
