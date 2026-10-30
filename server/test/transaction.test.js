import test from 'node:test';
import assert from 'node:assert/strict';
import { runTransaction } from '../src/utils/transaction.js';
import { AppError } from '../src/utils/errors.js';

const labelled = label => Object.assign(new Error(label), { errorLabels: [label] });
const immediate = { pause: async () => {} };
function fakeSession(commitErrors = []) {
  return {
    starts: 0, commits: 0, aborts: 0, ends: 0, active: false,
    startTransaction(options) { this.starts++; this.active = true; assert.equal(options.readConcern.level, 'snapshot'); assert.equal(options.writeConcern.w, 'majority'); },
    async commitTransaction() { this.commits++; const error = commitErrors.shift(); if (error) throw error; this.active = false; },
    inTransaction() { return this.active; },
    async abortTransaction() { this.aborts++; this.active = false; },
    async endSession() { this.ends++; },
  };
}

test('default retry policy tolerates sustained contention while keeping a bounded ceiling', async () => {
  const session = fakeSession(); let calls = 0;
  const result = await runTransaction(async () => session, async () => { if (++calls <= 6) throw labelled('TransientTransactionError'); return 'saved'; }, immediate);
  assert.equal(result, 'saved'); assert.equal(session.starts, 7); assert.equal(session.ends, 1);
  const busy = fakeSession();
  await assert.rejects(() => runTransaction(async () => busy, async () => { throw labelled('TransientTransactionError'); }, immediate), { code: 'TRANSACTION_RETRY_EXHAUSTED' });
  assert.equal(busy.starts, 12); assert.equal(busy.ends, 1);
});
test('transient failures abort and start fresh transactions before committing once', async () => {
  const session = fakeSession(); let calls = 0;
  const result = await runTransaction(async () => session, async () => { if (++calls < 3) throw labelled('TransientTransactionError'); return 'saved'; }, immediate);
  assert.equal(result, 'saved'); assert.equal(session.starts, 3); assert.equal(session.aborts, 2); assert.equal(session.commits, 1); assert.equal(session.ends, 1);
});
test('transaction retries are bounded and exhaustion is a structured 503', async () => {
  const session = fakeSession();
  await assert.rejects(() => runTransaction(async () => session, async () => { throw labelled('TransientTransactionError'); }, { ...immediate, maxAttempts: 3 }), { status: 503, code: 'TRANSACTION_RETRY_EXHAUSTED' });
  assert.equal(session.starts, 3); assert.equal(session.ends, 1);
});
test('elapsed retry budget stops additional transaction attempts', async () => {
  const session = fakeSession(); let clock = 0;
  await assert.rejects(() => runTransaction(async () => session, async () => { clock = 100; throw labelled('TransientTransactionError'); }, { ...immediate, now: () => clock, retryBudgetMs: 50 }), { code: 'TRANSACTION_RETRY_EXHAUSTED' });
  assert.equal(session.starts, 1);
});
test('an unknown commit retries the same commit without replaying the transaction', async () => {
  const session = fakeSession([labelled('UnknownTransactionCommitResult')]); let calls = 0;
  assert.equal(await runTransaction(async () => session, async () => { calls++; return 'saved'; }, immediate), 'saved');
  assert.equal(calls, 1); assert.equal(session.starts, 1); assert.equal(session.commits, 2); assert.equal(session.aborts, 0);
});
test('unknown commit exhaustion remains ambiguous and never replays writes or aborts', async () => {
  const session = fakeSession(Array.from({ length: 3 }, () => labelled('UnknownTransactionCommitResult'))); let calls = 0;
  await assert.rejects(() => runTransaction(async () => session, async () => { calls++; }, immediate), { status: 503, code: 'TRANSACTION_COMMIT_UNKNOWN' });
  assert.equal(calls, 1); assert.equal(session.commits, 3); assert.equal(session.aborts, 0); assert.equal(session.ends, 1);
});
test('a transient error after an ambiguous commit does not replay writes', async () => {
  const session = fakeSession([labelled('UnknownTransactionCommitResult'), labelled('TransientTransactionError')]);
  await assert.rejects(() => runTransaction(async () => session, async () => {}, immediate), { code: 'TRANSACTION_COMMIT_UNKNOWN' });
  assert.equal(session.starts, 1); assert.equal(session.commits, 2);
});
test('business conflicts are not retried', async () => {
  const session = fakeSession();
  await assert.rejects(() => runTransaction(async () => session, async () => { throw new AppError(409, 'Already booked', 'BOOKING_CONFLICT'); }, immediate), { status: 409, code: 'BOOKING_CONFLICT' });
  assert.equal(session.starts, 1); assert.equal(session.aborts, 1);
});
test('standalone MongoDB transaction failures never fall back to an unsafe write', async () => {
  const session = fakeSession(); let calls = 0;
  await assert.rejects(() => runTransaction(async () => session, async () => { calls++; throw Object.assign(new Error('Transaction numbers are only allowed on a replica set member or mongos'), { code: 20 }); }, immediate), { code: 'TRANSACTIONS_UNAVAILABLE' });
  assert.equal(calls, 1); assert.equal(session.commits, 0);
});
