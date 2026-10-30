import { z } from 'zod';
import { AppError } from './errors.js';
import { isSafeImageUrl } from './resourceRules.js';

export const idSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const password = z.string().min(8, 'Use at least 8 characters for your password.').max(72, 'Use at most 72 characters for your password.').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes');
export const registerSchema = z.object({ name: z.string().trim().min(2, 'Enter your full name (at least 2 characters).').max(80), email: z.string().trim().email('Enter a valid email address.').max(254).transform(v => v.toLowerCase()), password });
export const loginSchema = registerSchema.pick({ email: true }).extend({ password: z.string().min(1, 'Enter your password.').max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes') });
export const resourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  type: z.enum(['room', 'lab', 'equipment']),
  capacity: z.number().int().min(1).max(10000),
  location: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).default(''),
  imageUrl: z.string().trim().max(2048).refine(isSafeImageUrl, 'Use an HTTP(S) image URL without embedded credentials, or leave it empty.').default(''),
  isActive: z.boolean().default(true),
});
const positiveQueryInteger = max => z.string().regex(/^[1-9]\d*$/, 'Use a positive whole number.').transform(Number).pipe(z.number().int().max(max));
export const resourceQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  type: z.enum(['room', 'lab', 'equipment']).optional(),
  page: positiveQueryInteger(100000).default('1'),
  limit: positiveQueryInteger(100).default('12'),
  includeInactive: z.enum(['true', 'false']).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});
export const bookingSchema = z.object({
  resource: idSchema,
  startTime: z.string().datetime({ offset: true }),
  endTime: z.string().datetime({ offset: true }),
  purpose: z.string().trim().min(3).max(500),
});
const bookingListFields = z.object({
  status: z.enum(['confirmed', 'cancelled']).optional(),
  period: z.enum(['all', 'upcoming', 'past', 'cancelled']).default('all'),
  search: z.string().trim().max(100).optional(),
  type: z.enum(['room', 'lab', 'equipment']).optional(),
  resource: idSchema.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  sort: z.enum(['startAsc', 'startDesc']).optional(),
  page: positiveQueryInteger(100000).default('1'),
  limit: positiveQueryInteger(100).default('20'),
});
const validBookingRange = value => !value.from || !value.to || new Date(value.from) < new Date(value.to);
const rangeError = { message: 'End of the date range must be after its start.', path: ['to'] };
export const myBookingQuerySchema = bookingListFields.strict().refine(validBookingRange, rangeError);
export const adminBookingQuerySchema = bookingListFields.extend({ user: idSchema.optional(), scope: z.literal('all').optional() }).strict().refine(validBookingRange, rangeError);
export const adminDashboardQuerySchema = z.object({ upcomingLimit: positiveQueryInteger(20).default('6'), activityLimit: positiveQueryInteger(20).default('8') }).strict();
export const utilizationQuerySchema = z.object({ days: z.enum(['7', '30', '90']).default('30').transform(Number), limit: positiveQueryInteger(10).default('5') }).strict();
export function parse(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const err = new AppError(400, 'Please check your input.', 'VALIDATION_ERROR');
    err.details = parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message }));
    throw err;
  }
  return parsed.data;
}
