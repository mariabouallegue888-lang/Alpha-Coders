import { verifyToken } from '../services/tokenService.js';
import { User } from '../models/User.js';
import { AppError, asyncRoute } from '../utils/errors.js';

export const authenticate = asyncRoute(async (req, _res, next) => {
  const token = req.headers.authorization?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!token) throw new AppError(401, 'Please sign in to continue.');
  const payload = verifyToken(token);
  req.user = await User.findById(payload.sub);
  if (!req.user) throw new AppError(401, 'Account no longer exists.');
  next();
});
export function adminOnly(req, _res, next) {
  if (!req.user) return next(new AppError(401, 'Please sign in to continue.'));
  if (req.user.role !== 'admin') return next(new AppError(403, 'Administrator access required.'));
  next();
}
