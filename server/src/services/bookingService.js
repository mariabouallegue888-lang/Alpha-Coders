import mongoose from 'mongoose';
import { Booking } from '../models/Booking.js';
import { Resource } from '../models/Resource.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/errors.js';
import { validateTimes, overlapFilter, utcDayWindow, dayAvailability } from '../utils/bookingRules.js';
import { runTransaction } from '../utils/transaction.js';
import { assertCancellationAllowed } from '../utils/bookingManagement.js';

export async function createBooking(user, input) {
  validateTimes(input.startTime, input.endTime);
  const id = new mongoose.Types.ObjectId();
  try {
    return await runTransaction(() => mongoose.startSession(), async session => {
      // This write must be the first database operation: all competing writers
      // on this resource must obtain a new snapshot after a write conflict.
      const resource = await Resource.findOneAndUpdate({ _id: input.resource, isActive: true, deletedAt: null }, { $inc: { bookingVersion: 1 } }, { session, new: true, maxTimeMS: 2000 });
      if (!resource) throw new AppError(404, 'Resource is unavailable.', 'RESOURCE_UNAVAILABLE');
      // Recheck the clock on every retry, including time spent waiting for the lock.
      const { start, end } = validateTimes(input.startTime, input.endTime);
      if (await Booking.exists(overlapFilter(resource._id, start, end)).session(session).maxTimeMS(2000)) throw new AppError(409, 'This resource is already booked during the requested time. Choose a different time.', 'BOOKING_CONFLICT');
      const [booking] = await Booking.create([{ _id: id, user: user._id, resource: resource._id, startTime: start, endTime: end, purpose: input.purpose, status: 'confirmed' }], { session, maxTimeMS: 2000 });
      return { ...booking.toJSON(), resource: resource.toJSON(), user: { _id: user._id, name: user.name, email: user.email } };
    });
  } catch (error) {
    if (error.code === 'TRANSACTION_COMMIT_UNKNOWN') error.meta = { bookingId: String(id) };
    throw error;
  }
}
export async function cancelBooking(user, id) {
  try {
    return await runTransaction(() => mongoose.startSession(), async session => {
      const booking = await Booking.findById(id).session(session).maxTimeMS(2000);
      const mustCancel = assertCancellationAllowed(booking, user);
      let resource;
      if (mustCancel) {
        resource = await Resource.findByIdAndUpdate(booking.resource, { $inc: { bookingVersion: 1 } }, { session, new: true, maxTimeMS: 2000 });
        if (!resource) throw new AppError(409, 'The booking resource no longer exists.', 'RESOURCE_REFERENCE_MISSING');
        assertCancellationAllowed(booking, user); // Recheck time after waiting for the resource lock.
        booking.status = 'cancelled'; booking.cancelledAt = new Date();
        await Booking.updateOne({ _id: id }, { $set: { status: 'cancelled', cancelledAt: booking.cancelledAt } }, { session, maxTimeMS: 2000 });
      } else resource = await Resource.findById(booking.resource).session(session).maxTimeMS(2000);
      // Sequential reads avoid parallel operations on a transaction session.
      const owner = await User.findById(booking.user).select('name email').session(session).maxTimeMS(2000);
      return {
        booking: { ...booking.toJSON(), resource: resource?.toJSON() || null, user: owner ? { _id: owner._id, name: owner.name, email: owner.email } : null },
        alreadyCancelled: !mustCancel,
        message: mustCancel ? 'Reservation cancelled. The interval is now available for booking.' : 'This reservation was already cancelled. No changes were made.',
      };
    });
  } catch (error) {
    if (error.code === 'TRANSACTION_COMMIT_UNKNOWN') {
      error.message = 'The database could not confirm the cancellation. Refresh your bookings to check its status. Repeating cancellation is safe.';
      error.meta = { bookingId: id, operation: 'cancel' };
    }
    throw error;
  }
}

export async function getDayAvailability(resourceId, date) {
  const { start, end } = utcDayWindow(date);
  const resource = await Resource.exists({ _id: resourceId, isActive: true, deletedAt: null });
  if (!resource) throw new AppError(404, 'Resource is unavailable.', 'RESOURCE_UNAVAILABLE');
  const bookings = await Booking.find(overlapFilter(resourceId, start, end)).select('startTime endTime -_id').sort({ startTime: 1 }).lean();
  return { resourceId, ...dayAvailability(date, bookings) };
}
