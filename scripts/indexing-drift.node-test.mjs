import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

test('generator rejects changed, missing and obsolete output, then removes obsolete files', () => {
  const root = mkdtempSync(join(tmpdir(), 'lob-indexing-drift-'));
  try {
    for (const path of ['scripts', 'dist', 'indexing', 'examples']) cpSync(new URL(`../${path}`, import.meta.url), join(root, path), { recursive: true,
      filter: source => !/(?:^|\/)(?:node_modules|\.envio|generated|build)(?:\/|$)/.test(source) || source.includes('/dist/generated') });
    const script = join(root, 'scripts/indexing-artifacts.mjs');
    const run = mode => spawnSync(process.execPath, [script, mode], { encoding: 'utf8' });
    symlinkSync(new URL('../node_modules', import.meta.url).pathname, join(root, 'node_modules'));
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    let checked = run('--check'); assert.equal(checked.status, 0, checked.stderr);
    const path = join(root, 'examples/envio/src/EventHandlers.ts'), original = readFileSync(path);
    writeFileSync(path, '// stale'); assert.notEqual(run('--check').status, 0);
    rmSync(path); assert.notEqual(run('--check').status, 0);
    writeFileSync(path, original);
    writeFileSync(join(root, 'examples/envio/src/obsolete.ts'), '// obsolete');
    assert.notEqual(run('--check').status, 0);
    checked = run('--write'); assert.equal(checked.status, 0, checked.stderr);
    checked = run('--check'); assert.equal(checked.status, 0, checked.stderr);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
