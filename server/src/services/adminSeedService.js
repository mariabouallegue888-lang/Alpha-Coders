import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { parse, registerSchema } from '../utils/validation.js';

export function validateAdminSeed(environment) {
  if (environment.NODE_ENV !== 'development') throw new Error('Admin seeding is only allowed with NODE_ENV=development.');
  if (environment.SEED_ADMIN_PASSWORD === 'change-this-before-seeding') throw new Error('Choose a unique SEED_ADMIN_PASSWORD before seeding.');
  return parse(registerSchema, {
    name: environment.SEED_ADMIN_NAME || 'Campus Administrator',
    email: environment.SEED_ADMIN_EMAIL,
    password: environment.SEED_ADMIN_PASSWORD,
  });
}

export async function seedAdmin(admin) {
  await User.init();
  const existing = await User.findOne({ email: admin.email });
  if (existing) {
    if (existing.role !== 'admin') throw new Error('Seed email belongs to a regular user; refusing to elevate it.');
    return; // Never reset an existing account's password.
  }
  await User.create({ name: admin.name, email: admin.email, password: await bcrypt.hash(admin.password, 12), role: 'admin' });
}
