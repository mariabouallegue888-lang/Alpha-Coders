import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rateLimit } from 'express-rate-limit';
import { env } from './config/env.js';
import { api } from './routes/api.js';
import { AppError, errorHandler } from './utils/errors.js';

export const app = express();
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: { directives: {
  // Resource image URLs are validated HTTP(S); keep scripts restricted to this origin.
  imgSrc: ["'self'", 'data:', 'https:', 'http:'],
  upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
} } }));
app.use(cors({ origin: env.CLIENT_ORIGIN }));
app.use(express.json({ limit: '32kb' }));
app.get('/api/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({ status: connected ? 'ok' : 'unavailable', database: connected ? 'connected' : 'disconnected' });
});
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 200, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: { message: 'Too many requests. Please try again shortly.' } } }), api);
app.use('/api', (_req, _res, next) => next(new AppError(404, 'Endpoint not found.')));
if (env.NODE_ENV === 'production') {
  const clientDirectory = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  app.use(express.static(clientDirectory));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDirectory, 'index.html')));
}
app.use((_req, _res, next) => next(new AppError(404, 'Endpoint not found.')));
app.use(errorHandler);
