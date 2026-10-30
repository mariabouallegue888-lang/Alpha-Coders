import { setTimeout as delay } from 'node:timers/promises';
import { AppError } from './errors.js';

export const TRANSACTION_LIMITS = Object.freeze({ maxAttempts: 12, maxCommitAttempts: 3, retryBudgetMs: 10000 });
const labelled = (error, label) => error.hasErrorLabel?.(label) || error.errorLabels?.includes(label);
const exhausted = () => new AppError(503, 'The resource is busy. Please try again shortly.', 'TRANSACTION_RETRY_EXHAUSTED');
const uncertain = () => new AppError(503, 'The database could not confirm the outcome. Check your bookings before submitting again.', 'TRANSACTION_COMMIT_UNKNOWN');

// Core API, rather than withTransaction: explicitly bound both kinds of retries.
// No network/API side effects belong inside work(), which can run again.
export async function runTransaction(startSession, work, overrides = {}) {
  const { maxAttempts, maxCommitAttempts, retryBudgetMs, now = Date.now, pause = delay } = { ...TRANSACTION_LIMITS, ...overrides };
  const began = now();
  const withinBudget = () => now() - began < retryBudgetMs;
  const backoff = attempt => pause(Math.min(25 * 2 ** attempt + Math.floor(Math.random() * 25), 250));
  const session = await startSession();
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt && !withinBudget()) throw exhausted();
      let commitUncertain = false;
      try {
        session.startTransaction({ readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary', maxCommitTimeMS: 2000 });
        const result = await work(session);
        for (let commitAttempt = 0; commitAttempt < maxCommitAttempts; commitAttempt++) {
          try { await session.commitTransaction(); return result; }
          catch (error) {
            if (labelled(error, 'UnknownTransactionCommitResult')) {
              commitUncertain = true;
              if (commitAttempt + 1 >= maxCommitAttempts || !withinBudget()) throw uncertain();
              await backoff(commitAttempt);
              continue; // Retry this exact commit; never replay writes on an uncertain outcome.
            }
            if (commitUncertain) throw uncertain();
            throw error;
          }
        }
      } catch (error) {
        if (commitUncertain || error.code === 'TRANSACTION_COMMIT_UNKNOWN') throw error;
        if (session.inTransaction()) { try { await session.abortTransaction(); } catch { /* Best effort; preserve the original error. */ } }
        if (error.code === 20 || /Transaction numbers are only allowed on a replica set member or mongos/i.test(error.message)) {
          throw new AppError(503, 'Booking transactions require a MongoDB replica set or Atlas. No booking was created.', 'TRANSACTIONS_UNAVAILABLE');
        }
        if (!labelled(error, 'TransientTransactionError')) throw error;
        if (attempt + 1 >= maxAttempts || !withinBudget()) throw exhausted();
        await backoff(attempt);
      }
    }
    throw exhausted();
  } finally { try { await session.endSession(); } catch { console.warn('Transaction session cleanup failed.'); } }
}
