import { Booking } from '../models/Booking.js';
import { Resource } from '../models/Resource.js';
import { User } from '../models/User.js';
import { HOUR_MS, DAY_MS, KPI_DEFINITIONS, inventoryMetrics, utilizationWindow, dailyScheduledHours, recentActivity } from '../utils/adminDashboard.js';

const aggregate = (model, pipeline) => model.aggregate(pipeline).option({ maxTimeMS: 10000, allowDiskUse: true });
const resourceLookup = () => [
  { $lookup: { from: Resource.collection.name, localField: 'resource', foreignField: '_id', pipeline: [{ $project: { name: 1, type: 1, location: 1, isActive: 1 } }], as: 'resource' } },
  { $unwind: { path: '$resource', preserveNullAndEmptyArrays: true } },
];
const ownerLookup = () => [
  { $lookup: { from: User.collection.name, localField: 'user', foreignField: '_id', pipeline: [{ $project: { name: 1, email: 1 } }], as: 'user' } },
  { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
];

function bookingActivity(kind, field, limit, asOf) {
  return aggregate(Booking, [
    { $match: { [field]: { $type: 'date', $lte: asOf }, ...(kind === 'booking_cancelled' ? { status: 'cancelled' } : {}) } },
    { $sort: { [field]: -1, _id: -1 } }, { $limit: limit },
    ...resourceLookup(), ...ownerLookup(),
    { $project: { _id: 0, id: { $concat: [kind, ':', { $toString: '$_id' }] }, kind: { $literal: kind }, at: `$${field}`, bookingId: '$_id',
      resource: { $ifNull: ['$resource', null] }, user: { $ifNull: ['$user', null] },
    } },
  ]);
}
function resourceActivity(kind, field, limit, asOf) {
  return aggregate(Resource, [
    { $match: { [field]: { $type: 'date', $lte: asOf } } },
    { $sort: { [field]: -1, _id: -1 } }, { $limit: limit },
    { $project: { _id: 0, id: { $concat: [kind, ':', { $toString: '$_id' }] }, kind: { $literal: kind }, at: `$${field}`,
      resource: { _id: '$_id', name: '$name', type: '$type', location: '$location', isActive: '$isActive' }, user: { $literal: null },
    } },
  ]);
}

export async function getAdminDashboard({ upcomingLimit = 6, activityLimit = 8 } = {}, asOf = new Date()) {
  const [inventory, bookingCounts, upcomingBookings, created, cancelled, resourcesAdded, resourcesArchived] = await Promise.all([
    aggregate(Resource, [{ $match: { deletedAt: null } }, { $group: { _id: '$type', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } } } }]),
    aggregate(Booking, [
      { $match: { status: { $in: ['confirmed', 'cancelled'] } } },
      { $group: { _id: null,
        confirmedUpcomingReservations: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'confirmed'] }, { $gt: ['$endTime', asOf] }] }, 1, 0] } },
        cancelledReservations: { $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] } },
        inProgressReservations: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'confirmed'] }, { $lte: ['$startTime', asOf] }, { $gt: ['$endTime', asOf] }] }, 1, 0] } },
      } },
    ]),
    aggregate(Booking, [
      { $match: { status: 'confirmed', endTime: { $gt: asOf } } }, { $sort: { startTime: 1, _id: 1 } }, { $limit: upcomingLimit },
      ...resourceLookup(), ...ownerLookup(),
      { $project: { user: { $ifNull: ['$user', null] }, resource: { $ifNull: ['$resource', null] }, startTime: 1, endTime: 1, purpose: 1, status: 1 } },
    ]),
    bookingActivity('booking_created', 'createdAt', activityLimit, asOf),
    bookingActivity('booking_cancelled', 'cancelledAt', activityLimit, asOf),
    resourceActivity('resource_created', 'createdAt', activityLimit, asOf),
    resourceActivity('resource_archived', 'deletedAt', activityLimit, asOf),
  ]);
  const { distribution, ...resources } = inventoryMetrics(inventory);
  const counts = bookingCounts[0];
  return {
    asOf: asOf.toISOString(),
    kpis: { ...resources, confirmedUpcomingReservations: counts?.confirmedUpcomingReservations || 0, cancelledReservations: counts?.cancelledReservations || 0, inProgressReservations: counts?.inProgressReservations || 0 },
    definitions: KPI_DEFINITIONS, resourceDistribution: distribution, upcomingBookings,
    recentActivity: recentActivity([created, cancelled, resourcesAdded, resourcesArchived], activityLimit),
    activityNote: 'Derived from recorded creation, cancellation and archive timestamps. This is not an immutable audit log; reservation owners are not necessarily the actors who cancelled them.',
  };
}

export async function getResourceUtilization({ days = 30, limit = 5 } = {}, asOf = new Date()) {
  const { start, end } = utilizationWindow(days, asOf);
  const [result] = await aggregate(Booking, [
    { $match: { status: 'confirmed', startTime: { $lt: end }, endTime: { $gt: start } } },
    { $project: { resource: 1, clippedStart: { $max: ['$startTime', start] }, clippedEnd: { $min: ['$endTime', end] } } },
    { $match: { $expr: { $gt: ['$clippedEnd', '$clippedStart'] } } },
    { $set: { scheduledMilliseconds: { $subtract: ['$clippedEnd', '$clippedStart'] } } },
    { $facet: {
      totals: [{ $group: { _id: null, scheduledMilliseconds: { $sum: '$scheduledMilliseconds' }, bookingCount: { $sum: 1 } } }],
      usedResources: [{ $group: { _id: '$resource' } }, { $count: 'value' }],
      topResources: [
        { $group: { _id: '$resource', scheduledMilliseconds: { $sum: '$scheduledMilliseconds' }, bookingCount: { $sum: 1 } } },
        { $sort: { scheduledMilliseconds: -1, _id: 1 } }, { $limit: limit },
        { $lookup: { from: Resource.collection.name, localField: '_id', foreignField: '_id', pipeline: [{ $project: { name: 1, type: 1, isActive: 1 } }], as: 'resource' } },
        { $project: { _id: 0, resourceId: '$_id', resource: { $ifNull: [{ $arrayElemAt: ['$resource', 0] }, null] }, bookingCount: 1, scheduledHours: { $divide: ['$scheduledMilliseconds', HOUR_MS] } } },
      ],
      daily: [
        { $set: { firstDay: { $dateTrunc: { date: '$clippedStart', unit: 'day', timezone: 'UTC' } }, lastDay: { $dateTrunc: { date: { $subtract: ['$clippedEnd', 1] }, unit: 'day', timezone: 'UTC' } } } },
        { $set: { offsets: { $range: [0, { $toInt: { $add: [{ $dateDiff: { startDate: '$firstDay', endDate: '$lastDay', unit: 'day', timezone: 'UTC' } }, 1] } }] } } },
        { $unwind: '$offsets' },
        { $set: { day: { $dateAdd: { startDate: '$firstDay', unit: 'day', amount: '$offsets', timezone: 'UTC' } } } },
        { $group: { _id: { $dateToString: { date: '$day', format: '%Y-%m-%d', timezone: 'UTC' } }, scheduledMilliseconds: { $sum: { $subtract: [{ $min: ['$clippedEnd', { $add: ['$day', DAY_MS] }] }, { $max: ['$clippedStart', '$day'] }] } } } },
        { $sort: { _id: 1 } },
      ],
    } },
  ]);
  return {
    asOf: asOf.toISOString(), window: { days, start: start.toISOString(), end: end.toISOString(), timeZone: 'UTC' },
    measurement: 'confirmed_scheduled_hours', scheduledHours: (result?.totals[0]?.scheduledMilliseconds || 0) / HOUR_MS,
    bookingCount: result?.totals[0]?.bookingCount || 0, resourcesUsed: result?.usedResources[0]?.value || 0,
    topResources: result?.topResources || [], daily: dailyScheduledHours(result?.daily || [], start, end),
    utilizationPercent: null,
    limitations: 'Confirmed scheduled hours are clipped to the elapsed window, exclude cancelled reservations and include preserved inactive/archived resource history. They do not measure attendance. Opening hours and activation history are not recorded, so a utilization percentage cannot be calculated honestly.',
  };
}
