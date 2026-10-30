import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { User } from '../models/User.js';
import { AppError } from '../utils/errors.js';
import { safeProfile } from '../utils/profile.js';
import { issueToken } from './tokenService.js';

const dummyHash = bcrypt.hash(randomBytes(32).toString('hex'), 12);
const session = user => ({ user: safeProfile(user), token: issueToken(user) });
export async function register({ name, email, password }) {
  const user = await User.create({ name, email, password: await bcrypt.hash(password, 12), role: 'user' });
  return session(user);
}
export async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  const matches = await bcrypt.compare(password, user?.password || await dummyHash);
  if (!user || !matches) throw new AppError(401, 'Email or password is incorrect.');
  return session(user);
}
