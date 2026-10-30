import { spawnSync } from 'node:child_process';

if (!process.env.MONGODB_TEST_URI) {
  console.error('Set MONGODB_TEST_URI to MongoDB 5.0+ (the full application requires a replica set). Admin aggregation and authorization integration tests were not run.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['--test', 'test/admin-dashboard.integration.test.js'], { stdio: 'inherit', env: process.env, windowsHide: true });
if (result.error) console.error('Could not start admin integration tests.');
process.exit(result.status ?? 1);
