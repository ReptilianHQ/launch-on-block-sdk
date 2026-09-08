import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { decodeEventLog } from 'viem';
import { launchOnBlockEventCatalog as catalog } from '../dist/indexing.js';
import { validateMaterializations } from './indexing-materializations.mjs';

const handlers = new Map(), registrations = new Map();
const indexer = {
  onEvent: (key, handler) => handlers.set(`${key.contract}.${key.event}`, handler),
  contractRegister: (key, handler) => registrations.set(`${key.contract}.${key.event}`, handler),
};
const source = readFileSync(new URL('../examples/envio/src/EventHandlers.ts', import.meta.url), 'utf8');
new Function('indexer', stripTypeScriptTypes(source.replace('import { indexer } from "envio";', '')))(indexer);
const fixture = JSON.parse(readFileSync(new URL('../fixtures/indexing-receipts.json', import.meta.url)));
function context() {
  const stores = Object.fromEntries(['LobProtocolEvent', ...catalog.materializations.map(e => e.name)].map(name => [name, new Map()]));
  const registered = { LaunchToken: new Set(), GraduationPool: new Set() };
  return { stores, registered, context: {
    ...Object.fromEntries(Object.entries(stores).map(([name, map]) => [name, { get: async id => map.get(id), set: row => map.set(row.id, row) }])),
    chain: Object.fromEntries(Object.entries(registered).map(([name, set]) => [name, { add: address => set.add(address.toLowerCase()) }])),
  } };
}
function events(receipt, contractName) {
  const contract = catalog.contracts.find(c => c.name === contractName);
  return receipt.logs.flatMap(log => {
    if (!contract.events.some(e => e.topic0 === log.topics[0])) return [];
    const decoded = decodeEventLog({ abi: contract.eventAbi, ...log });
    return [{ name: decoded.eventName, params: decoded.args, chainId: 4663, srcAddress: log.address, logIndex: Number(BigInt(log.logIndex)),
      block: { number: Number(BigInt(receipt.blockNumber)), hash: receipt.blockHash, timestamp: 123 },
      transaction: { hash: receipt.transactionHash, transactionIndex: Number(BigInt(receipt.transactionIndex)) } }];
  });
}
const launchEvents = events(fixture.receipts[0], 'Launchpad');
const created = launchEvents.find(e => e.name === 'LaunchCreated');
const curve = launchEvents.find(e => e.name === 'CurveSelected');
const graduated = events(fixture.receipts[2], 'Launchpad').find(e => e.name === 'Graduated');
const run = (name, event, state) => handlers.get(name)({ event, context: state.context });

test('all catalog events and dynamic registrations are generated', () => {
  assert.match(readFileSync(new URL('../examples/envio/config.yaml', import.meta.url), 'utf8'), /^handlers: \.\/src$/m);
  assert.deepEqual([...handlers.keys()], catalog.contracts.flatMap(c => c.events.map(e => `${c.name}.${e.name}`)));
  assert.deepEqual([...registrations.keys()].sort(), ['Launchpad.Graduated', 'Launchpad.LaunchCreated']);
  assert.equal((readFileSync(new URL('../examples/envio/schema.graphql', import.meta.url), 'utf8').match(/^type /gm) ?? []).length, 3);
});
test('real launch/curve payloads join in either order and duplicates remain idempotent', async () => {
  const a = context(), b = context();
  for (const e of [created, curve, created, curve]) await run(`Launchpad.${e.name}`, e, a);
  for (const e of [curve, created]) await run(`Launchpad.${e.name}`, e, b);
  assert.deepEqual(a.stores.LobLaunch, b.stores.LobLaunch);
  assert.equal(a.stores.LobProtocolEvent.size, 2);
  const row = [...a.stores.LobLaunch.values()][0];
  assert.equal(row.creatorBps, 300n);
  assert.equal(row.quoteTarget, 4160000000000000000n);
  assert.equal(row.token, '0x0148b4ef4c5fe04ce8c9d5405c91b4dca821b10c');
  const log = [...a.stores.LobProtocolEvent.values()][0];
  assert.equal(log.transactionHash, created.transaction.hash);
  assert.equal(log.signature, 'LaunchCreated(address,address,uint16,uint16,address,string)');
  assert.equal(log.blockTimestamp, 123n); // Synthetic timestamp for handler fixture only.
  await registrations.get('Launchpad.LaunchCreated')({ event: created, context: a.context });
  assert.ok(a.registered.LaunchToken.has(row.token));
});
test('graduation proves membership without inventing missing launch identity', async () => {
  const state = context(); await run('Launchpad.Graduated', graduated, state);
  await registrations.get('Launchpad.Graduated')({ event: graduated, context: state.context });
  const pool = [...state.stores.LobPool.values()][0];
  assert.equal(pool.pool, '0x341c7b20832267db663d0317ae59c8d0db36a980');
  assert.equal(pool.token, graduated.params.token.toLowerCase());
  assert.ok(state.registered.GraduationPool.has(pool.pool));
  assert.equal([...state.stores.LobLaunch.values()][0].creator, undefined);
  const otherChain = { ...graduated, chainId: 46630 };
  await run('Launchpad.Graduated', otherChain, state);
  assert.equal(state.stores.LobPool.size, 2);
});
test('lossless token amount and required provenance; conflicting identity is rejected', async () => {
  const state = context();
  const transfer = events(fixture.receipts[0], 'LaunchToken')[0];
  await run('LaunchToken.Transfer', transfer, state);
  assert.equal(JSON.parse([...state.stores.LobProtocolEvent.values()][0].payload).value, '1000000000000000000000000000');
  await assert.rejects(run('LaunchToken.Transfer', { ...transfer, transaction: {} }, state), /required provenance/);
  await run('Launchpad.LaunchCreated', created, state);
  await assert.rejects(run('Launchpad.LaunchCreated', { ...created, params: { ...created.params, creatorBps: 400 } }, state), /Conflicting LobLaunch.creatorBps/);
  assert.equal([...state.stores.LobLaunch.values()][0].creatorBps, 300n);
});
test('catalog validation rejects unknown parameters and invalid partial entities', () => {
  const bad = structuredClone(catalog); bad.materializations[0].updates[0].set.creator.parameter = 'absent';
  assert.throws(() => validateMaterializations(bad), /Unknown parameter/);
  const partial = structuredClone(catalog); delete partial.materializations[0].updates[0].set.token;
  assert.throws(() => validateMaterializations(partial), /Missing required/);
});
