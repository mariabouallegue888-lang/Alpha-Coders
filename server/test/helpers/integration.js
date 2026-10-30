import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export function testCalendar(reference = new Date()) {
  // Fixed calendar times, safely beyond the real server clock, stable throughout a run/year.
  const start = Date.UTC(reference.getUTCFullYear() + 1, 0, 15);
  return { day: new Date(start).toISOString().slice(0, 10), at: (hour, dayOffset = 0) => new Date(start + dayOffset * 86400000 + hour * 3600000).toISOString() };
}

export async function integrationHarness(t) {
  assert.ok(process.env.MONGODB_TEST_URI, 'MONGODB_TEST_URI is required.');
  process.env.MONGODB_URI = process.env.MONGODB_TEST_URI;
  process.env.JWT_SECRET = 'acceptance-tests-only-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';
  const { default: mongoose } = await import('mongoose');
  const { app } = await import('../../src/app.js');
  const { User } = await import('../../src/models/User.js');
  const { Resource } = await import('../../src/models/Resource.js');
  const { Booking } = await import('../../src/models/Booking.js');
  const database = `campus_acceptance_test_${randomUUID().replaceAll('-', '')}`;
  await mongoose.connect(process.env.MONGODB_TEST_URI, { dbName: database, serverSelectionTimeoutMS: 10000 });
  let server;
  t.after(async () => {
    if (server) await new Promise(resolve => server.close(resolve));
    try { assert.equal(mongoose.connection.name, database); await mongoose.connection.dropDatabase(); }
    finally { await mongoose.disconnect(); }
  });
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  assert.ok((topology.setName || topology.msg === 'isdbgrid') && topology.isWritablePrimary, 'A writable replica set or mongos is required; a standalone process is insufficient.');
  await Promise.all([User.init(), Resource.init(), Booking.init()]);
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const request = async (path, method = 'GET', body, token) => {
    const response = await fetch(base + path, { method, signal: AbortSignal.timeout(30000), headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, headers: response.headers, data: await response.json() };
  };
  return { request, User, Resource, Booking, database, mongoose };
}
