import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'fork-gate-test-'));
  for (const dir of ['scripts', 'src', 'docs', '.github/workflows', 'node_modules/vitest']) mkdirSync(join(root, dir), { recursive: true });
  copyFileSync(new URL('./fork.mjs', import.meta.url), join(root, 'scripts/fork.mjs'));
  for (const file of ['src/example.ts', 'package-lock.json', 'tsconfig.json', 'tsconfig.test.json', '.github/workflows/publish.yml']) writeFileSync(join(root, file), '{}');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ version: '1.0.0' }));
  const mock = `import {writeFileSync} from 'node:fs'; ${run}; writeFileSync(process.argv.find(x=>x.startsWith('--outputFile=')).slice(13),JSON.stringify({success:true,numPassedTests:3,numPendingTests:0}));`;
  writeFileSync(join(root, 'node_modules/vitest/vitest.mjs'), mock);
  const invoke = (args, rpc = 'http://unused.invalid') => spawnSync(process.execPath, ['scripts/fork.mjs', ...args], { cwd: root, env: { PATH: process.env.PATH, ...(rpc ? { SDK_FORK_EIP155_4663_RPC_URL: rpc } : {}) }, encoding: 'utf8' });
  return { root, invoke, clean: () => rmSync(root, { recursive: true, force: true }) };
}

test('required verification rejects missing RPC while optional invocation skips', () => {
  const f = fixture('');
  try { assert.equal(f.invoke([], '').status, 0); assert.notEqual(f.invoke(['--required'], '').status, 0); } finally { f.clean(); }
});
test('successful evidence validates unchanged source and rejects later source/build changes', () => {
  const f = fixture('');
  try {
    assert.equal(f.invoke(['--required']).status, 0);
    assert.equal(f.invoke(['--check-evidence']).status, 0);
    writeFileSync(join(f.root, 'scripts/build.mjs'), '// changed build');
    assert.notEqual(f.invoke(['--check-evidence']).status, 0);
  } finally { f.clean(); }
});
test('changes during execution cannot acquire a passing evidence record', () => {
  const f = fixture(`writeFileSync('src/example.ts', '// changed during execution')`);
  try { const result = f.invoke(['--required']); assert.notEqual(result.status, 0); assert.match(result.stderr, /inputs changed during fork execution/); } finally { f.clean(); }
});
test('a skipped or incomplete report cannot acquire release evidence', () => {
  const f = fixture('');
  try {
    const p = join(f.root, 'node_modules/vitest/vitest.mjs');
    writeFileSync(p, readFileSync(p, 'utf8').replace('numPassedTests:3,numPendingTests:0', 'numPassedTests:2,numPendingTests:1'));
    assert.notEqual(f.invoke(['--required']).status, 0);
  } finally { f.clean(); }
});
