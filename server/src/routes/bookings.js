import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { asyncRoute } from '../utils/errors.js';
import { parse, idSchema, bookingSchema, myBookingQuerySchema, adminBookingQuerySchema } from '../utils/validation.js';
import { createBooking, cancelBooking } from '../services/bookingService.js';
import { listBookings } from '../services/bookingListService.js';

export const bookings = Router();
bookings.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
bookings.use(authenticate);
bookings.get('/me', asyncRoute(async (req, res) => res.json(await listBookings(parse(myBookingQuerySchema, req.query), req.user))));
bookings.get('/', adminOnly, asyncRoute(async (req, res) => res.json(await listBookings(parse(adminBookingQuerySchema, req.query)))));
bookings.post('/', asyncRoute(async (req, res) => res.status(201).json({ booking: await createBooking(req.user, parse(bookingSchema, req.body)) })));
bookings.patch('/:id/cancel', asyncRoute(async (req, res) => res.json(await cancelBooking(req.user, parse(idSchema, req.params.id)))));
