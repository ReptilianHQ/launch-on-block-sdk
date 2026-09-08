// Explicit live acceptance smoke: public RPC reads and an owned disposable DB.
// Never runs in build, check, or release. Requires Docker and check:envio-example.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const output = process.argv[2];
if (!output) throw new Error('Usage: node scripts/smoke-envio.mjs <evidence.json>');
const root = fileURLToPath(new URL('..', import.meta.url));
const directory = mkdtempSync(join(tmpdir(), 'lob-envio-smoke-'));
const name = `lob-envio-smoke-${randomUUID()}`;
const rpc = 'https://rpc.mainnet.chain.robinhood.com';
const firstBlock = 18582638, lastBlock = 18582640;
const hash = value => createHash('sha256').update(value).digest('hex');
const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 120000, ...options });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout;
};
let owned = false;
try {
  cpSync(join(root, 'indexing'), join(directory, 'indexing'), { recursive: true });
  const cwd = join(directory, 'examples/envio');
  cpSync(join(root, 'examples/envio'), cwd, { recursive: true,
    filter: path => !/(?:^|\/)(?:node_modules|\.envio|logs)(?:\/|$)/.test(path) });
  symlinkSync(join(root, 'examples/envio/node_modules'), join(cwd, 'node_modules'));
  let config = readFileSync(join(cwd, 'config.yaml'), 'utf8').split('  - id: 46630')[0];
  assert.ok(config.includes('handlers: ./src\n'), 'Envio handlers must name a directory');
  config = config.replaceAll('17957183', String(firstBlock));
  config = config.replace(`    start_block: ${firstBlock}`, `    start_block: ${firstBlock}\n    end_block: ${lastBlock}`);
  config = config.replace('      - url: ${ENVIO_ROBINHOOD_MAINNET_RPC_URL}', `      - url: ${rpc}\n        for: sync\n        initial_block_interval: 3\n        interval_ceiling: 3`);
  writeFileSync(join(cwd, 'config.yaml'), config);
  run('docker', ['run', '--detach', '--name', name, '--publish', '127.0.0.1::5432',
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', 'POSTGRES_DB=lob_smoke', 'postgres:17-alpine']);
  owned = true;
  const port = run('docker', ['port', name, '5432']).trim().split(':').at(-1);
  let ready = false;
  for (let i = 0; i < 30; i++) {
    if (spawnSync('docker', ['exec', name, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Local Postgres readiness timeout');
  const env = { ...process.env, ENVIO_PG_HOST: '127.0.0.1', ENVIO_PG_PORT: port,
    ENVIO_PG_USER: 'postgres', ENVIO_PG_PASSWORD: 'local', ENVIO_PG_DATABASE: 'lob_smoke',
    ENVIO_PG_SCHEMA: 'public', ENVIO_HASURA: 'false', ENVIO_TUI: 'false', ENVIO_INDEXER_PORT: '29899' };
  const cli = join(cwd, 'node_modules/envio/bin.mjs');
  const firstLog = run(process.execPath, [cli, 'start'], { cwd, env });
  assert.match(firstLog, /All chains are caught up to end blocks/);
  const query = sql => run('docker', ['exec', name, 'psql', '-U', 'postgres', '-d', 'lob_smoke', '-Atc', sql]).trim();
  const snapshot = () => ({
    events: query('SELECT coalesce(json_agg(t ORDER BY t."logIndex"),\'[]\') FROM "LobProtocolEvent" t;'),
    launches: query('SELECT coalesce(json_agg(t ORDER BY t.id),\'[]\') FROM "LobLaunch" t;'),
    pools: query('SELECT coalesce(json_agg(t ORDER BY t.id),\'[]\') FROM "LobPool" t;'),
  });
  const beforeRaw = snapshot();
  const before = Object.fromEntries(Object.entries(beforeRaw).map(([key, value]) => [key, JSON.parse(value)]));
  assert.deepEqual(before.events.map(e => [e.kind, String(e.logIndex)]), [['Transfer', '15'], ['Transfer', '16'], ['LaunchCreated', '17'], ['CurveSelected', '18']]);
  const fixture = JSON.parse(readFileSync(join(root, 'fixtures/indexing-receipts.json')));
  assert.ok(before.events.every(e => e.transactionHash === fixture.receipts[0].transactionHash));
  assert.equal(JSON.parse(before.events[0].payload).value, '1000000000000000000000000000');
  assert.equal(before.launches.length, 1);
  assert.equal(before.launches[0].token, '0x0148b4ef4c5fe04ce8c9d5405c91b4dca821b10c');
  const resumeLog = run(process.execPath, [cli, 'start'], { cwd, env });
  assert.match(resumeLog, /Resuming indexing state/);
  assert.match(resumeLog, /All chains are caught up to end blocks/);
  const after = snapshot(); assert.deepEqual(after, beforeRaw);
  const evidence = {
    schemaVersion: 1, observedAt: new Date().toISOString(), chainId: 4663, rpc,
    range: { fromBlock: firstBlock, toBlock: lastBlock }, nodeVersion: process.version,
    envioVersion: JSON.parse(readFileSync(join(cwd, 'node_modules/envio/package.json'))).version,
    handlersSha256: hash(readFileSync(join(cwd, 'src/EventHandlers.ts'))), configSha256: hash(config),
    result: 'PASS', eventCount: before.events.length, launchCount: before.launches.length, poolCount: before.pools.length,
    eventKinds: before.events.map(e => e.kind), resumedWithoutReset: true,
    beforeSha256: hash(JSON.stringify(beforeRaw)), afterSha256: hash(JSON.stringify(after)),
    scope: 'Three-block public RPC backfill and persisted-database restart in Envio. No complete deployment backfill, team provider, or live reorg claim.',
  };
  writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n');
  console.log(`PASS: ${before.events.length} events and ${before.launches.length} launch; durable restart unchanged.`);
} finally {
  if (owned) run('docker', ['rm', '--force', name]);
  rmSync(directory, { recursive: true, force: true });
}
