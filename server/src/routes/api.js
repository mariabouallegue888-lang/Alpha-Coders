import { bookings } from './bookings.js';
import { resources } from './resources.js';
import { admin } from './admin.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authenticate } from '../middleware/auth.js';
import { register, login } from '../services/authService.js';
import { asyncRoute } from '../utils/errors.js';
import { parse, registerSchema, loginSchema } from '../utils/validation.js';
import { safeProfile } from '../utils/profile.js';

export const api = Router();
api.use('/auth', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { message: 'Too many attempts. Please try again later.' } } });
api.post('/auth/register', authLimit, asyncRoute(async (req, res) => res.status(201).json(await register(parse(registerSchema, req.body)))));
api.post('/auth/login', authLimit, asyncRoute(async (req, res) => res.json(await login(parse(loginSchema, req.body)))));
api.get('/auth/me', authenticate, (req, res) => res.json({ user: safeProfile(req.user) }));

api.use('/resources', resources);
api.use('/bookings', bookings);
api.use('/admin', admin);
