import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { asyncRoute, AppError } from '../utils/errors.js';
import { parse, idSchema, resourceSchema, resourceQuerySchema, bookingSchema } from '../utils/validation.js';
import { listResources, getResource, createResource, updateResource, deleteResource } from '../services/resourceService.js';
import { Booking } from '../models/Booking.js';
import { validateTimes, overlapFilter } from '../utils/bookingRules.js';
import { getDayAvailability } from '../services/bookingService.js';

export const resources = Router();
// Public reads stay public. A supplied bearer token is verified before using its role.
resources.use((req, res, next) => {
  if (req.method === 'GET' && (req.headers.authorization || req.query.includeInactive === 'true' || req.query.isActive === 'false')) return authenticate(req, res, next);
  next();
});
resources.get('/', asyncRoute(async (req, res) => {
  const query = parse(resourceQuerySchema, req.query);
  if ((query.includeInactive === 'true' || query.isActive === 'false') && req.user?.role !== 'admin') throw new AppError(403, 'Administrator access required to view inactive resources.');
  res.json(await listResources(query, req.user));
}));
resources.get('/:id/availability', asyncRoute(async (req, res) => {
  const id = parse(idSchema, req.params.id);
  res.set('Cache-Control', 'no-store');
  if (req.query.date !== undefined) {
    if (req.query.startTime !== undefined || req.query.endTime !== undefined) throw new AppError(400, 'Use date or an explicit time interval, not both.', 'INVALID_AVAILABILITY_QUERY');
    return res.json(await getDayAvailability(id, req.query.date));
  }
  const { startTime, endTime } = parse(bookingSchema.pick({ startTime: true, endTime: true }), req.query);
  const { start, end } = validateTimes(startTime, endTime);
  const resource = await getResource(id);
  res.json({ available: !await Booking.exists(overlapFilter(resource.id, start, end)) });
}));
resources.get('/:id', asyncRoute(async (req, res) => res.json({ resource: await getResource(parse(idSchema, req.params.id), req.user) })));
resources.post('/', authenticate, adminOnly, asyncRoute(async (req, res) => res.status(201).json({ resource: await createResource(parse(resourceSchema, req.body)) })));
resources.put('/:id', authenticate, adminOnly, asyncRoute(async (req, res) => res.json({ resource: await updateResource(parse(idSchema, req.params.id), parse(resourceSchema, req.body)) })));
// Preserve compatibility with the existing partial-update API.
resources.patch('/:id', authenticate, adminOnly, asyncRoute(async (req, res) => {
  const input = parse(resourceSchema.partial().refine(value => Object.keys(value).length > 0, 'Provide at least one resource field.'), req.body);
  res.json({ resource: await updateResource(parse(idSchema, req.params.id), input) });
}));
resources.delete('/:id', authenticate, adminOnly, asyncRoute(async (req, res) => res.json(await deleteResource(parse(idSchema, req.params.id)))));
