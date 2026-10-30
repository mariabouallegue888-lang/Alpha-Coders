import { spawnSync } from 'node:child_process';

if (!process.env.MONGODB_TEST_URI) {
  console.error('Set MONGODB_TEST_URI to a MongoDB replica set or Atlas URI. Booking integration tests were not run.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', 'test/booking.integration.test.js', 'test/my-bookings.integration.test.js'], { stdio: 'inherit', env: process.env, windowsHide: true });
if (result.error) console.error('Could not start booking integration tests.');
process.exit(result.status ?? 1);
