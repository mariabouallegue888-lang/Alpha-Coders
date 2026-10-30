import mongoose from 'mongoose';
import { env } from './config/env.js';
import { Resource } from './models/Resource.js';
import { seedAdmin, validateAdminSeed } from './services/adminSeedService.js';

try {
  const admin = validateAdminSeed({ ...process.env, NODE_ENV: env.NODE_ENV });
  await mongoose.connect(env.MONGODB_URI);
  await seedAdmin(admin);
  const resources = [
    { name: 'The Reading Room', type: 'room', capacity: 8, location: 'Central Library · Level 2', description: 'A quiet, sunlit space for focused work and small study groups. Whiteboard, power outlets, and fast campus Wi-Fi.' },
    { name: 'Innovation Lab', type: 'lab', capacity: 24, location: 'Engineering Building · E104', description: 'Bring your next idea to life. Collaborative benches, development workstations, and presentation facilities.' },
    { name: 'Media Studio', type: 'room', capacity: 6, location: 'Arts Centre · Ground Floor', description: 'A dedicated space for recording, editing, and creative collaboration. Acoustic treatment and adjustable lighting.' },
    { name: 'DSLR Camera Kit', type: 'equipment', capacity: 1, location: 'Media Services · Collection Desk', description: 'Capture your campus story. Includes a DSLR camera, versatile zoom lens, tripod, and a protective carry case.' },
    { name: 'Seminar Room 204', type: 'room', capacity: 30, location: 'West Wing · Level 2', description: 'A flexible room for workshops and group presentations. Includes a projector and movable tables.' },
    { name: 'Computing Lab', type: 'lab', capacity: 40, location: 'Technology Centre · T301', description: 'High performance workstations for programming, data analysis, and digital projects.' },
  ];
  for (const resource of resources) await Resource.updateOne({ name: resource.name }, { $setOnInsert: resource }, { upsert: true });
  console.log(`Seed complete. Admin: ${admin.email}. Existing accounts and resources were preserved.`);
} catch {
  console.error('Development seed failed. Check NODE_ENV=development, unique seed credentials, and database connectivity. Existing regular users cannot be promoted.');
  process.exitCode = 1;
} finally { await mongoose.disconnect(); }
