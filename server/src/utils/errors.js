export class AppError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') { super(message); this.status = status; this.code = code; }
}
export const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function errorHandler(err, req, res, _next) {
  let status = err.status || 500;
  let message = status === 500 ? 'An unexpected error occurred.' : err.message;
  if (err.code === 11000) { status = 409; message = 'This email is already registered.'; }
  if (err.name === 'CastError') { status = 400; message = 'Invalid identifier.'; }
  if (err.type === 'entity.parse.failed') { status = 400; message = 'Invalid JSON body.'; }
  if (status >= 500) console.error('Request failed', { name: err.name, code: err.code });
  if (err.code === 'TRANSACTION_RETRY_EXHAUSTED') res.set('Retry-After', '1');
  res.status(status).json({ error: { message, code: err instanceof AppError ? err.code : status === 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED', ...(err.details ? { details: err.details } : {}), ...(err instanceof AppError && err.meta ? { meta: err.meta } : {}) } });
}
