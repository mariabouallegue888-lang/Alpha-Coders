import mongoose from 'mongoose';
import { Resource } from '../models/Resource.js';
import { Booking } from '../models/Booking.js';
import { AppError } from '../utils/errors.js';
import { resourceFilter, visibilityFilter, futureBookingFilter } from '../utils/resourceRules.js';
import { runTransaction } from '../utils/transaction.js';

export async function listResources(query, user) {
  const admin = user?.role === 'admin';
  const filter = resourceFilter(query, admin);
  const [resources, total, counts] = await Promise.all([
    Resource.find(filter).sort({ name: 1, _id: 1 }).skip((query.page - 1) * query.limit).limit(query.limit),
    Resource.countDocuments(filter),
    Resource.aggregate([{ $match: visibilityFilter(query, admin) }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
  ]);
  const totalPages = Math.ceil(total / query.limit);
  return {
    resources,
    pagination: { page: query.page, limit: query.limit, total, totalPages, hasNextPage: query.page < totalPages, hasPreviousPage: query.page > 1 && totalPages > 0 },
    typeCounts: Object.fromEntries(['room', 'lab', 'equipment'].map(type => [type, counts.find(entry => entry._id === type)?.count || 0])),
  };
}

export async function getResource(id, user) {
  const resource = await Resource.findOne({ _id: id, deletedAt: null, ...(user?.role === 'admin' ? {} : { isActive: true }) });
  if (!resource) throw new AppError(404, 'Resource not found or unavailable.');
  return resource;
}

export const createResource = input => Resource.create(input);
export async function updateResource(id, input) {
  const resource = await Resource.findOneAndUpdate({ _id: id, deletedAt: null }, { $set: input }, { new: true, runValidators: true });
  if (!resource) throw new AppError(404, 'Resource not found.');
  return resource;
}

export async function deleteResource(id) {
  return runTransaction(() => mongoose.startSession(), async session => {
      // Serialize with booking creation on this same document before inspecting bookings.
      const resource = await Resource.findOneAndUpdate({ _id: id, deletedAt: null }, { $inc: { bookingVersion: 1 } }, { session, new: true, maxTimeMS: 2000 });
      if (!resource) throw new AppError(404, 'Resource not found.');
      if (await Booking.exists(futureBookingFilter(resource._id)).session(session).maxTimeMS(2000)) {
        throw new AppError(409, 'Cannot delete this resource: it has upcoming or ongoing confirmed bookings. Cancel those bookings or wait until they end, then try again.', 'RESOURCE_HAS_BOOKINGS');
      }
      // Keep the document for populated historical references, but remove it from the directory.
      await Resource.updateOne({ _id: id }, { $set: { isActive: false, deletedAt: new Date() } }, { session, maxTimeMS: 2000 });
      return { resourceId: id, message: 'Resource deleted from the directory. Existing booking history has been preserved.' };
  });
}
