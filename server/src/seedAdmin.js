import mongoose from 'mongoose';
import { env } from './config/env.js';
import { seedAdmin, validateAdminSeed } from './services/adminSeedService.js';

try {
  const admin = validateAdminSeed({ ...process.env, NODE_ENV: env.NODE_ENV });
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  await seedAdmin(admin);
  console.log('Development administrator ready. Existing credentials were preserved.');
} catch (error) {
  console.error(error.name === 'ZodError' || error.details ? 'Invalid seed configuration. Check SEED_ADMIN_NAME, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD.' : error.code === 11000 ? 'Account already exists; no credentials were changed.' : 'Admin seed failed. Check development environment settings and database connectivity.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
