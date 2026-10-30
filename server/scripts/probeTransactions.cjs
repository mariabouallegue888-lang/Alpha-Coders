/* Optional REAL MongoDB protocol diagnostic, run by mongosh (not by Node's test runner).
 * Uses the application's unchanged retry helper, overlap predicates and policies.
 * Native driver operations below mirror the service's shared-document protocol.
 * This does NOT execute Express/Mongoose services or validate HTTP authentication.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const root = process.env.CAMPUS_REPO_ROOT;
assert.ok(root, 'Use npm run test:db:probe.');
const { runTransaction } = require(path.join(root, 'server/src/utils/transaction.js'));
const { validateTimes, overlapFilter } = require(path.join(root, 'server/src/utils/bookingRules.js'));
const { assertCancellationAllowed } = require(path.join(root, 'server/src/utils/bookingManagement.js'));
const { AppError } = require(path.join(root, 'server/src/utils/errors.js'));
const { testCalendar } = require(path.join(root, 'server/test/helpers/integration.js'));

(async () => {
  // mongosh's embedded driver is only used by this diagnostic, never production code.
  const client = db.getMongo()._serviceProvider?.mongoClient;
  assert.ok(client?.startSession && client?.db, 'This mongosh version does not expose an embedded driver; run the full HTTP integration suite instead.');
  const hello = await client.db('admin').command({ hello: 1 });
  assert.ok(hello.isWritablePrimary && (hello.setName || hello.msg === 'isdbgrid'), 'A writable replica set is required.');
  const database = `campus_protocol_test_${randomUUID().replaceAll('-', '')}`;
  const target = client.db(database), resources = target.collection('resources'), bookings = target.collection('bookings');
  const report = { scope: 'database protocol only; Express/Mongoose HTTP suite still required', version: (await client.db('admin').command({ buildInfo: 1 })).version, replicaSet: hello.setName, checks: [], competingAttempts: 0, confirmedWinners: 0, conflicts: 0, transientRetries: 0 };
  const { at } = testCalendar();
  const room = new ObjectId(), separate = new ObjectId();
  const owner = { _id: new ObjectId(), role: 'user' }, other = { _id: new ObjectId(), role: 'user' };
  const input = (start, end, resource = room, offset = 0) => ({ resource, startTime: at(start, offset), endTime: at(end, offset), purpose: 'Database protocol verification' });
  async function lock(resource, session) {
    const result = await resources.findOneAndUpdate({ _id: resource, isActive: true, deletedAt: null }, { $inc: { bookingVersion: 1 } }, { session, returnDocument: 'after', maxTimeMS: 2000 });
    const value = result?._id ? result : result?.value;
    if (!value) throw new AppError(404, 'Resource unavailable.', 'RESOURCE_UNAVAILABLE');
    return value;
  }
  async function reserve(user, value) {
    validateTimes(value.startTime, value.endTime);
    let attempt = 0;
    return runTransaction(() => client.startSession(), async session => {
      if (attempt++ > 0) report.transientRetries++;
      await lock(value.resource, session);
      const { start, end } = validateTimes(value.startTime, value.endTime);
      if (await bookings.findOne(overlapFilter(value.resource, start, end), { session, maxTimeMS: 2000 })) throw new AppError(409, 'Time occupied.', 'BOOKING_CONFLICT');
      const booking = { _id: new ObjectId(), user: user._id, resource: value.resource, startTime: start, endTime: end, status: 'confirmed', purpose: value.purpose };
      await bookings.insertOne(booking, { session, maxTimeMS: 2000 });
      return booking;
    });
  }
  async function cancel(user, id) {
    return runTransaction(() => client.startSession(), async session => {
      const booking = await bookings.findOne({ _id: id }, { session });
      if (assertCancellationAllowed(booking, user)) {
        await lock(booking.resource, session);
        assertCancellationAllowed(booking, user);
        await bookings.updateOne({ _id: id }, { $set: { status: 'cancelled', cancelledAt: new Date() } }, { session });
      }
    });
  }
  try {
    await resources.insertMany([{ _id: room, isActive: true, deletedAt: null, bookingVersion: 0 }, { _id: separate, isActive: true, deletedAt: null, bookingVersion: 0 }]);
    await bookings.createIndex({ resource: 1, status: 1, startTime: 1, endTime: 1 });
    const original = await reserve(owner, input(10, 12));
    await assert.rejects(() => reserve(other, input(11, 13)), { status: 409, code: 'BOOKING_CONFLICT' });
    await reserve(other, input(12, 13));
    report.checks.push('10–12 succeeds; 11–13 conflicts; adjacent 12–13 succeeds');
    await assert.rejects(() => cancel(other, original._id), { status: 403 });
    await cancel(owner, original._id); await cancel(owner, original._id);
    await reserve(other, input(10, 12));
    assert.equal((await bookings.findOne({ _id: original._id })).status, 'cancelled');
    report.checks.push('Ownership, idempotent cancellation, preserved history and released-slot rebooking');
    await reserve(owner, input(10, 12, separate));
    await reserve(owner, input(8, 12, room, 1));
    await reserve(other, input(12, 12.5, room, 1));
    for (const end of [14, 14.25, 18.01]) await assert.rejects(() => reserve(owner, input(14, end, room, 1)), { status: 400 });
    await assert.rejects(() => reserve(owner, input(16, 15)), { code: 'INVALID_BOOKING_INTERVAL' });
    await assert.rejects(() => reserve(owner, { ...input(10, 12), startTime: '2000-01-01T10:00:00Z', endTime: '2000-01-01T12:00:00Z' }), { code: 'BOOKING_START_IN_PAST' });
    report.checks.push('Separate resources, 30-minute/4-hour limits, past and inverted intervals');
    for (let round = 0; round < 5; round++) {
      const results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => reserve(i % 2 ? owner : other, input(10, 12, room, round + 2))));
      const winners = results.filter(result => result.status === 'fulfilled');
      const conflicts = results.filter(result => result.status === 'rejected' && result.reason.code === 'BOOKING_CONFLICT');
      assert.equal(winners.length, 1); assert.equal(conflicts.length, 4);
      report.competingAttempts += 5; report.confirmedWinners += winners.length; report.conflicts += conflicts.length;
    }
    assert.ok(report.transientRetries > 0, 'The probe must exercise a real conflicting transaction retry.');
    const rows = await bookings.find({ status: 'confirmed' }).sort({ resource: 1, startTime: 1 }).toArray();
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) if (String(rows[i].resource) === String(rows[j].resource)) assert.ok(!(rows[i].startTime < rows[j].endTime && rows[i].endTime > rows[j].startTime), 'Persisted active bookings overlap.');
    report.checks.push('Five simultaneous competitors × five rounds; no persisted overlapping active pairs');
    report.result = 'PASS';
    print(JSON.stringify(report, null, 2));
  } finally {
    assert.match(database, /^campus_protocol_test_[a-f0-9]{32}$/);
    assert.equal(target.databaseName, database);
    await target.dropDatabase();
  }
})().catch(error => { console.error('Database protocol probe FAILED:', error.message); quit(1); });
