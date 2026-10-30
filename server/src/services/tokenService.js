import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export const tokenOptions = { algorithm: 'HS256', issuer: 'campus-booking-api', audience: 'campus-booking-client' };
export function issueToken(user) {
  return jwt.sign({}, env.JWT_SECRET, { ...tokenOptions, subject: String(user._id), expiresIn: env.JWT_TTL_SECONDS });
}
export function verifyToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: [tokenOptions.algorithm], issuer: tokenOptions.issuer, audience: tokenOptions.audience,
      maxAge: env.JWT_TTL_SECONDS,
    });
    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || !/^[a-f\d]{24}$/i.test(payload.sub) || !Number.isFinite(payload.exp) || !Number.isFinite(payload.iat)) throw new Error('Invalid claims');
    return payload;
  } catch {
    throw new AppError(401, 'Your session is invalid or expired. Please sign in again.');
  }
}
