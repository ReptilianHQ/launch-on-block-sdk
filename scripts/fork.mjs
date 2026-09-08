import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidencePath = join(root, 'docs/fork-evidence.json');
const args = process.argv.slice(2);
if (args.some(arg => !['--required', '--check-evidence'].includes(arg))) throw new TypeError('Usage: node scripts/fork.mjs [--required | --check-evidence]');
function sourceFiles(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sourceFiles(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
}
function inputs() {
  return Object.fromEntries([...sourceFiles('src'), 'scripts/fork.mjs', 'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.test.json'].sort().map(path => [path, createHash('sha256').update(readFileSync(join(root, path))).digest('hex')]));
}
const version = JSON.parse(readFileSync(join(root, 'package.json'))).version;
if (args.includes('--check-evidence')) {
  const evidence = JSON.parse(readFileSync(evidencePath));
  if (evidence.status !== 'PASS' || evidence.version !== version || evidence.passedTests !== 3 || JSON.stringify(evidence.inputs) !== JSON.stringify(inputs())) throw new TypeError('Fork evidence is absent or stale. Run npm run test:fork -- --required against the reviewed pin before release.');
  console.log(`Fork evidence matches SDK ${version} source and all three executed suites.`);
} else if (!process.env.SDK_FORK_EIP155_4663_RPC_URL) {
  if (args.includes('--required')) throw new TypeError('SDK_FORK_EIP155_4663_RPC_URL is required for release fork verification.');
  console.log('SKIP fork suite: set SDK_FORK_EIP155_4663_RPC_URL to an archive RPC and install anvil. No release evidence written.');
} else {
  const temp = mkdtempSync(join(tmpdir(), 'lob-fork-'));
  try {
    const reportPath = join(temp, 'report.json');
    const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/transactions.fork.test.ts', '--reporter=json', `--outputFile=${reportPath}`], { cwd: root, env: process.env, stdio: 'inherit', timeout: 600_000 });
    if (result.error || result.status !== 0) throw new TypeError('Pinned fork verification failed; no release evidence written.', { cause: result.error });
    const report = JSON.parse(readFileSync(reportPath));
    if (!report.success || report.numPassedTests !== 3 || report.numPendingTests !== 0) throw new TypeError('Expected all three fork suites to execute without skips.');
    const evidence = { schemaVersion: 1, status: 'PASS', version, recordedAt: new Date().toISOString(), passedTests: report.numPassedTests, scope: 'Pinned local EVM fork execution; no production submission, finality or reorg proof. RPC endpoint omitted.', inputs: inputs() };
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`PASS: recorded source-bound fork evidence for SDK ${version}.`);
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
