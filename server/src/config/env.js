import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_TTL_SECONDS: z.coerce.number().int().min(900).max(28800).default(3600),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) throw new Error(`Invalid environment: ${parsed.error.message}`);
if (parsed.data.NODE_ENV === 'production' && parsed.data.JWT_SECRET === 'replace-with-at-least-32-random-characters') throw new Error('Set a unique JWT_SECRET before running in production.');
export const env = parsed.data;
