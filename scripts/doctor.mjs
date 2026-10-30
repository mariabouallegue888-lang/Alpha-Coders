import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import dns from 'node:dns/promises';
import { spawnSync } from 'node:child_process';

// Read-only configuration inspection and workspace-only temporary write probes.
// Never print npm configuration files, auth tokens, proxy credentials or raw errors.
const root = fileURLToPath(new URL('../', import.meta.url));
const npmCli = process.env.npm_execpath;
if (!npmCli) {
  console.error('Run this diagnostic with npm run doctor.');
  process.exit(1);
}
const npm = args => spawnSync(process.execPath, [npmCli, ...args], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 20000 });
const config = key => npm(['config', 'get', key]).stdout?.trim();
const publicOrigin = value => {
  if (!value || ['null', 'undefined'].includes(value)) return null;
  try { return new URL(value).origin; } catch { return '(configured; value redacted)'; }
};
const errorCode = value => /\b(EACCES|EPERM|ENOTCACHED|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ECONNRESET|CERT_HAS_EXPIRED|UNABLE_TO_VERIFY_LEAF_SIGNATURE)\b/.exec(value || '')?.[1] || null;
const registry = config('registry');
const report = {
  node: process.version, npm: npm(['--version']).stdout?.trim(),
  registry: publicOrigin(registry),
  npmCache: config('cache'), projectCache: path.join(root, '.npm-cache'),
  strictSsl: config('strict-ssl'),
  npmProxy: publicOrigin(config('proxy')), npmHttpsProxy: publicOrigin(config('https-proxy')),
  environmentProxies: Object.fromEntries(['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY'].map(key => [key, publicOrigin(process.env[key])])),
  noProxyConfigured: !!process.env.NO_PROXY,
  extraCaConfigured: !!process.env.NODE_EXTRA_CA_CERTS,
  tlsVerificationExplicitlyDisabled: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0',
  lockfilePresent: ['package-lock.json', 'npm-shrinkwrap.json'].some(name => fs.existsSync(path.join(root, name))),
  workspaceWrites: {}, modules: {},
};
for (const directory of ['.npm-cache', 'node_modules']) {
  const parent = path.join(root, directory);
  let probe;
  try {
    fs.mkdirSync(parent, { recursive: true });
    probe = fs.mkdtempSync(path.join(parent, '.campus-doctor-'));
    const first = path.join(probe, 'first'), renamed = path.join(probe, 'renamed');
    fs.writeFileSync(first, 'workspace permission probe');
    fs.renameSync(first, renamed); fs.unlinkSync(renamed); fs.rmdirSync(probe); probe = null;
    report.workspaceWrites[directory] = 'PASS: create, rename and delete';
  } catch (error) { report.workspaceWrites[directory] = error.code || 'FAILED'; }
  finally {
    // Remove only these known probe files; never recursively remove directories.
    if (probe) {
      for (const name of ['first', 'renamed']) { try { fs.unlinkSync(path.join(probe, name)); } catch { /* Already absent or inaccessible. */ } }
      try { fs.rmdirSync(probe); } catch { /* Leave inaccessible temporary data intact. */ }
    }
  }
}
const require = createRequire(path.join(root, 'package.json'));
for (const name of ['mongoose', 'express', 'react', 'eslint', 'typescript', 'vite', 'vitest']) {
  try { require.resolve(name); report.modules[name] = 'RESOLVABLE'; }
  catch { report.modules[name] = 'MISSING'; }
}
const registryUrl = new URL(registry);
try { report.dns = { result: 'PASS', addresses: (await dns.lookup(registryUrl.hostname, { all: true })).length }; }
catch (error) { report.dns = { result: 'FAIL', code: error.code }; }
report.directTcp = await new Promise(resolve => {
  const socket = net.connect({ host: registryUrl.hostname, port: Number(registryUrl.port || (registryUrl.protocol === 'https:' ? 443 : 80)) });
  socket.setTimeout(5000);
  socket.once('connect', () => { socket.destroy(); resolve({ result: 'PASS', note: 'TCP only; no TLS or HTTP tested by this probe.' }); });
  socket.once('error', error => resolve({ result: 'FAIL', code: error.code, note: 'Connection failed before TLS.' }));
  socket.once('timeout', () => { socket.destroy(); resolve({ result: 'FAIL', code: 'ETIMEDOUT' }); });
});
const ping = npm(['ping', '--cache', report.projectCache, '--fetch-retries=0', '--fetch-timeout=10000']);
report.npmPing = { result: ping.status === 0 ? 'PASS' : 'FAIL', exitCode: ping.status, code: errorCode(ping.stderr) || ping.error?.code || null };
const installed = Object.values(report.modules).every(value => value === 'RESOLVABLE');
report.canValidateOffline = installed;
report.diagnosis = report.directTcp.code === 'EACCES' && Object.values(report.workspaceWrites).every(value => value.startsWith('PASS'))
  ? installed ? 'NETWORK_ACCESS_DENIED_BEFORE_TLS: dependencies resolve, so offline application validation can proceed. Do not change TLS settings or filesystem ACLs.' : 'NETWORK_ACCESS_DENIED_BEFORE_TLS: workspace permissions work; restore verified packages from a readable npm cache or use a network-enabled execution environment. Do not change TLS settings or filesystem ACLs.'
  : report.npmPing.result === 'PASS' ? 'Registry is reachable. Install dependencies; use npm ci only when a compatible lockfile exists.' : 'Registry probe failed. Inspect the reported network/configuration error before installing.';
report.installCommand = report.lockfilePresent ? 'npm ci --cache .npm-cache' : 'npm install --cache .npm-cache';
console.log(JSON.stringify(report, null, 2));
process.exitCode = installed && Object.values(report.workspaceWrites).every(value => value.startsWith('PASS')) ? 0 : 1;
