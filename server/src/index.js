import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';
import { User } from './models/User.js';
import { Resource } from './models/Resource.js';
import { Booking } from './models/Booking.js';

try {
  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  const topology = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!topology.setName && topology.msg !== 'isdbgrid') throw new Error('MongoDB must run as a replica set (or Atlas) for safe booking transactions. See README.md.');
  await Promise.all([User.init(), Resource.init(), Booking.init()]);
  const server = app.listen(env.PORT, () => console.log(`Campus API listening on http://localhost:${env.PORT}`));
  const shutdown = () => server.close(async () => { await mongoose.disconnect(); process.exit(0); });
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Unable to start API:', error.message);
  process.exit(1);
}
