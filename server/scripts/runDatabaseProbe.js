import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.env.MONGODB_TEST_URI) {
  console.error('Database protocol probe NOT RUN: set MONGODB_TEST_URI to a replica-set URI. This probe does not replace application HTTP integration tests.');
  process.exit(1);
}
const root = fileURLToPath(new URL('../../', import.meta.url));
const script = fileURLToPath(new URL('./probeTransactions.cjs', import.meta.url));
const result = spawnSync(process.env.MONGOSH_BINARY || 'mongosh', [process.env.MONGODB_TEST_URI, '--quiet', '--file', script], { stdio: 'inherit', windowsHide: true, env: { ...process.env, CAMPUS_REPO_ROOT: root } });
if (result.error) console.error('Could not launch mongosh. Install it or set MONGOSH_BINARY to its executable path.');
process.exit(result.status ?? 1);
