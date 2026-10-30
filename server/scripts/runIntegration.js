import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

if (!process.env.MONGODB_TEST_URI) {
  console.error('Integration tests NOT RUN: set MONGODB_TEST_URI to a writable replica-set URI. Each suite creates and drops only its own uniquely named test database.');
  process.exit(1);
}
const tests = readdirSync('test').filter(name => name.endsWith('.integration.test.js')).sort().map(name => `test/${name}`);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...tests], { stdio: 'inherit', env: process.env, windowsHide: true });
if (result.error) console.error('Could not start the integration test process.');
process.exit(result.status ?? 1);
