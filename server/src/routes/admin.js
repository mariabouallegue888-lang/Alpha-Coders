import { Router } from 'express';
import { authenticate, adminOnly } from '../middleware/auth.js';
import { asyncRoute } from '../utils/errors.js';
import { parse, adminDashboardQuerySchema, utilizationQuerySchema } from '../utils/validation.js';
import { getAdminDashboard, getResourceUtilization } from '../services/adminDashboardService.js';

export const admin = Router();
admin.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
// Every endpoint under /api/admin checks a verified JWT AND the current database role.
admin.use(authenticate, adminOnly);
admin.get('/dashboard', asyncRoute(async (req, res) => res.json(await getAdminDashboard(parse(adminDashboardQuerySchema, req.query)))));
admin.get('/dashboard/utilization', asyncRoute(async (req, res) => res.json(await getResourceUtilization(parse(utilizationQuerySchema, req.query)))));
