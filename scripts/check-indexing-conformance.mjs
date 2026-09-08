#!/usr/bin/env node
// Emitted from ReptilianHQ/reptilian scripts/check-sdk-indexing-conformance.mjs.
// Regenerate with node scripts/check-sdk-indexing-conformance.vendored.mjs --emit.
// Do not edit this body; the SDK checks its hash and the owner checks upstream drift.
// Canonical body sha256: 8f48bdf289fa6834fb63e1ef3f534427a1bf70221e72108a10a4bb11f89aec61

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// All current protocol SDKs have adopted this contract. Keep the map explicit
// so future exceptions require review rather than automatic grandfathering.
export const indexingAdoptionPending = new Map();

export function indexingConformance(manifest, hasFile) {
  const pending = indexingAdoptionPending.get(manifest.name);
  if (pending) return { failures: [], warnings: [`${manifest.name}: indexing adoption pending: ${pending}`] };
  const failures = [];
  for (const path of ['./indexing', './indexing/mainnet.json']) if (!manifest.exports?.[path]) failures.push(`missing indexing export ${path}`);
  for (const path of ['src/indexing.ts', 'indexing/mainnet.json', 'examples/envio/config.yaml', 'examples/envio/schema.graphql', 'examples/envio/src/EventHandlers.ts', 'examples/envio/package-lock.json']) if (!hasFile(path)) failures.push(`missing indexing file ${path}`);
  for (const script of ['generate:indexing', 'check:indexing', 'check:envio-example', 'test:pack']) if (!manifest.scripts?.[script]) failures.push(`missing indexing script ${script}`);
  // This verifies wiring, not generator semantics; the owning SDK executes the
  // drift and behavioral checks in CI and before publishing.
  for (const script of ['check', 'prepublishOnly']) {
    if (!/(?:npm run|pnpm(?: run)?) check:indexing(?:\s|$)/.test(manifest.scripts?.[script] ?? '')) failures.push(`${script} must run check:indexing`);
    if (!/(?:npm run|pnpm(?: run)?) check:envio-example(?:\s|$)/.test(manifest.scripts?.[script] ?? '')) failures.push(`${script} must run check:envio-example`);
  }
  if (manifest.files?.some(path => path === 'examples' || path.startsWith('examples/'))) failures.push('Envio starter must stay outside published files');
  return { failures, warnings: [] };
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/check-sdk-indexing-conformance.mjs <sdk-root> [...]');
  for (const root of process.argv.slice(2)) {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    const result = indexingConformance(manifest, path => existsSync(resolve(root, path)));
    result.warnings.forEach(message => console.warn(message));
    result.failures.forEach(message => console.error(`${root}: ${message}`));
    if (result.failures.length) process.exitCode = 1;
  }
}
