import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createReceiptReplay } from './replay.mjs';
const fixture = JSON.parse(readFileSync(new URL('../../fixtures/indexing-receipts.json', import.meta.url)));
const { chainId, receipts } = fixture;
const feed = (replay, receipt) => replay.ingest({ chainId, receipt });
const launchToken = '0x0148b4ef4c5fe04ce8c9d5405c91b4dca821b10c';

test('captured identities and ordered raw logs match prior pinned evidence', () => {
  const pinned = JSON.parse(readFileSync(new URL('../../fixtures/robinhood-mainnet.json', import.meta.url)));
  assert.equal(fixture.chainId, pinned.chainId);
  assert.equal(fixture.deploymentId, pinned.deploymentId);
  assert.equal(fixture.abiRevision, pinned.abiRevision);
  assert.equal(receipts.length, Object.keys(pinned.transactions).length);
  const normalize = logs => logs.map(({ address, topics, data }) => ({ address: address.toLowerCase(), topics: topics.map(x => x.toLowerCase()), data: data.toLowerCase() }));
  for (const receipt of receipts) {
    const expected = pinned.transactions[receipt.transactionHash];
    assert.equal(BigInt(receipt.blockNumber).toString(), expected.blockNumber);
    assert.deepEqual(normalize(receipt.logs), normalize(expected.receipt.logs));
  }
});

test('two-pass discovery retains earlier transfers with lossless values and provenance', () => {
  const replay = createReceiptReplay(chainId);
  feed(replay, receipts[0]);
  const { rows, sources } = replay.view();
  assert.equal(sources[launchToken], 'LaunchToken');
  assert.deepEqual(rows.map(row => [row.event, row.logIndex]), [['Transfer', '15'], ['Transfer', '16'], ['LaunchCreated', '17'], ['CurveSelected', '18']]);
  assert.equal(rows[0].args.value, '1000000000000000000000000000');
  assert.equal(rows[0].args.from, '0x0000000000000000000000000000000000000000');
  assert.equal(rows[0].emitter, launchToken);
  assert.equal(rows[0].transactionHash, receipts[0].transactionHash);
  assert.equal(rows[0].blockHash, receipts[0].blockHash);
  assert.equal(rows[0].id, `${chainId}:${receipts[0].blockHash}:15`);
});

test('JSON restart and duplicate receipts equal uninterrupted selected-receipt replay', () => {
  const continuous = createReceiptReplay(chainId);
  receipts.forEach(receipt => feed(continuous, receipt));
  const partial = createReceiptReplay(chainId);
  receipts.slice(0, 3).forEach(receipt => feed(partial, receipt));
  const restored = createReceiptReplay(chainId, JSON.parse(JSON.stringify(partial.snapshot())));
  receipts.forEach(receipt => feed(restored, receipt));
  assert.deepEqual(restored.view(), continuous.view());
  assert.equal(restored.view().rows.length, 13);
  const fees = restored.view().rows.find(row => row.event === 'ProtocolFeesCollected');
  assert.equal(fees.contract, 'GraduationPool');
  assert.equal(fees.emitter, '0x341c7b20832267db663d0317ae59c8d0db36a980');
  assert.equal(restored.view().checkpoint.blockNumber, '26066621');
});

test('explicit rollback removes orphan rows and discoveries before replacement replay', () => {
  const replay = createReceiptReplay(chainId);
  receipts.forEach(receipt => feed(replay, receipt));
  replay.rollbackTo(receipts[0].blockHash);
  const prefix = createReceiptReplay(chainId); feed(prefix, receipts[0]);
  assert.deepEqual(replay.view(), prefix.view());
  assert.equal(replay.view().sources['0x341c7b20832267db663d0317ae59c8d0db36a980'], undefined);
  replay.rollbackTo(null);
  assert.equal(replay.view().sources[launchToken], undefined);
  assert.equal(replay.view().checkpoint, null);
  // Synthetic replacement branch, explicitly not observed chain evidence.
  const replacement = structuredClone(receipts[0]);
  replacement.blockHash = `0x${'ab'.repeat(32)}`;
  replacement.logs.forEach(log => { log.blockHash = replacement.blockHash; });
  feed(replay, replacement);
  assert.ok(replay.view().rows.every(row => row.blockHash === replacement.blockHash));
  assert.equal(replay.view().rows.length, 4);
});

test('unknown discovery emitters cannot register a token', () => {
  const receipt = structuredClone(receipts[0]);
  receipt.logs.filter(log => log.address.toLowerCase() !== launchToken).forEach(log => { log.address = `0x${'aa'.repeat(20)}`; });
  const replay = createReceiptReplay(chainId); feed(replay, receipt);
  assert.equal(replay.view().sources[launchToken], undefined);
  assert.deepEqual(replay.view().rows, []);
});

test('conflicts, malformed known events and invalid provenance fail without changing state', () => {
  const replay = createReceiptReplay(chainId); feed(replay, receipts[0]);
  const before = replay.snapshot();
  const conflict = structuredClone(receipts[0]); conflict.blockHash = `0x${'cd'.repeat(32)}`;
  assert.throws(() => feed(replay, conflict), /conflict/);
  const malformed = structuredClone(receipts[1]); malformed.logs.at(-1).data = '0x';
  assert.throws(() => feed(replay, malformed));
  const badProvenance = structuredClone(receipts[1]); badProvenance.logs[0].blockHash = conflict.blockHash;
  assert.throws(() => feed(replay, badProvenance), /provenance/);
  assert.throws(() => replay.ingest({ chainId: 46630, receipt: receipts[1] }), /Wrong chain/);
  assert.throws(() => replay.rollbackTo(conflict.blockHash), /anchor/);
  assert.deepEqual(replay.snapshot(), before);
  const wrongIdentity = structuredClone(before); wrongIdentity.identity.abiRevision = 'unknown';
  assert.throws(() => createReceiptReplay(chainId, wrongIdentity), /identity mismatch/);
  feed(replay, receipts[2]);
  assert.throws(() => feed(replay, receipts[1]), /Out of order/);
});
