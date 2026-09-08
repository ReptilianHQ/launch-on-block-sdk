// Bounded, offline teaching example. The host supplies canonical receipts;
// this journal cannot establish chain ancestry, complete blocks, or finality.
import { isDeepStrictEqual } from 'node:util';
import { decodeEventLog } from 'viem';
import { getIndexingManifest, launchOnBlockEventCatalog } from '../../dist/indexing.js';

const json = value => JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item));
const lower = value => value.toLowerCase();
const position = receipt => [BigInt(receipt.blockNumber), BigInt(receipt.transactionIndex)];
const compare = (a, b) => {
  const [ab, at] = position(a), [bb, bt] = position(b);
  return ab < bb ? -1 : ab > bb ? 1 : at < bt ? -1 : at > bt ? 1 : 0;
};

export function createReceiptReplay(chainId, snapshot) {
  const manifest = getIndexingManifest(chainId);
  const identity = { schemaVersion: 1, chainId, deploymentId: manifest.deploymentId,
    releaseId: manifest.releaseId, abiRevision: manifest.abiRevision };
  const catalog = new Map(launchOnBlockEventCatalog.contracts.map(contract => [contract.name, contract]));
  let journal = [];

  function derive(receipts) {
    const sources = new Map(manifest.sources.filter(source => source.kind === 'fixed')
      .map(source => [lower(source.address), source.contract]));
    const rows = [];
    function decode(log) {
      const contract = catalog.get(sources.get(lower(log.address)));
      const event = contract?.events.find(event => lower(event.topic0) === lower(log.topics[0] ?? ''));
      if (!event) return null; // Unknown emitter or event is outside this catalog.
      const decoded = decodeEventLog({ abi: contract.eventAbi, topics: log.topics, data: log.data, strict: true });
      return { contract: contract.name, signature: event.signature, ...decoded };
    }
    for (const receipt of receipts) {
      // Registration first captures a discovered token's earlier logs in this receipt.
      for (const log of receipt.logs) {
        if (sources.get(lower(log.address)) !== 'Launchpad') continue;
        const event = decode(log);
        for (const contract of catalog.values()) {
          if (!event || contract.discoveredBy?.event !== event.eventName) continue;
          const address = lower(event.args[contract.discoveredBy.addressParameter]);
          if (sources.has(address) && sources.get(address) !== contract.name) throw new Error('Conflicting discovery');
          sources.set(address, contract.name);
        }
      }
      for (const log of receipt.logs) {
        const event = decode(log);
        if (!event) continue;
        rows.push(json({ id: `${chainId}:${lower(receipt.blockHash)}:${BigInt(log.logIndex)}`,
          chainId, blockHash: lower(receipt.blockHash), blockNumber: BigInt(receipt.blockNumber),
          transactionHash: lower(receipt.transactionHash), transactionIndex: BigInt(receipt.transactionIndex),
          logIndex: BigInt(log.logIndex), emitter: lower(log.address), contract: event.contract,
          event: event.eventName, signature: event.signature, args: event.args }));
      }
    }
    return { sources: Object.fromEntries(sources), rows };
  }

  function ingest(envelope) {
    if (envelope.chainId !== chainId) throw new Error('Wrong chain');
    const receipt = structuredClone(envelope.receipt);
    if (!/^0x[\da-f]{64}$/i.test(receipt.blockHash) || !/^0x[\da-f]{64}$/i.test(receipt.transactionHash)) throw new Error('Missing receipt identity');
    if (BigInt(receipt.status) !== 1n || BigInt(receipt.blockNumber) < BigInt(manifest.startBlock)) throw new Error('Receipt outside supported history');
    const duplicate = journal.find(item => lower(item.transactionHash) === lower(receipt.transactionHash));
    if (duplicate) {
      if (!isDeepStrictEqual(duplicate, receipt)) throw new Error('Receipt conflict; reconcile and roll back first');
      return; // Exact replay, including after restart, changes nothing.
    }
    const last = journal.at(-1);
    if (last && (compare(last, receipt) >= 0 || (BigInt(last.blockNumber) === BigInt(receipt.blockNumber) && lower(last.blockHash) !== lower(receipt.blockHash)))) throw new Error('Out of order or conflicting block; roll back first');
    let previous = -1n;
    for (const log of receipt.logs) {
      if (log.removed || lower(log.blockHash) !== lower(receipt.blockHash) || lower(log.transactionHash) !== lower(receipt.transactionHash)
        || BigInt(log.blockNumber) !== BigInt(receipt.blockNumber) || BigInt(log.transactionIndex) !== BigInt(receipt.transactionIndex)
        || BigInt(log.logIndex) <= previous) throw new Error('Invalid receipt log provenance/order');
      previous = BigInt(log.logIndex);
    }
    const next = [...journal, receipt];
    derive(next); // Validate before committing; decode failures leave state untouched.
    journal = next;
  }
  const api = {
    ingest,
    view: () => ({ ...derive(journal), checkpoint: journal.length ? {
      blockNumber: BigInt(journal.at(-1).blockNumber).toString(), blockHash: lower(journal.at(-1).blockHash),
      transactionIndex: BigInt(journal.at(-1).transactionIndex).toString(),
    } : null }),
    snapshot: () => ({ identity: { ...identity }, receipts: structuredClone(journal) }),
    rollbackTo(blockHash) {
      if (blockHash === null) { journal = []; return; }
      const index = journal.findLastIndex(receipt => lower(receipt.blockHash) === lower(blockHash));
      if (index < 0) throw new Error('Rollback anchor not in journal');
      journal = journal.slice(0, index + 1);
    },
  };
  if (snapshot) {
    if (!isDeepStrictEqual(snapshot.identity, identity)) throw new Error('Snapshot identity mismatch');
    for (const receipt of snapshot.receipts) ingest({ chainId, receipt });
  }
  return api;
}
