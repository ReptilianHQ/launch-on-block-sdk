// Read-only, explicit evidence capture. Never runs during build/test/release.
import { readFileSync, writeFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const pinned = JSON.parse(readFileSync(new URL('fixtures/robinhood-mainnet.json', root), 'utf8'));
const rpc = 'https://rpc.mainnet.chain.robinhood.com';
let id = 0;
async function request(method, params) {
  const response = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }), signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.json();
  if (body.error || body.result === null) throw new Error(JSON.stringify(body));
  return body.result;
}
if (Number(BigInt(await request('eth_chainId', []))) !== pinned.chainId) throw new Error('Wrong RPC chain');
const receipts = [];
for (const [hash, transaction] of Object.entries(pinned.transactions)) {
  const receipt = await request('eth_getTransactionReceipt', [hash]);
  if (receipt.transactionHash !== hash || BigInt(receipt.blockNumber) !== BigInt(transaction.blockNumber)) throw new Error('Receipt identity drift');
  const normalized = logs => logs.map(({ address, topics, data }) => ({ address: address.toLowerCase(), topics: topics.map(value => value.toLowerCase()), data: data.toLowerCase() }));
  if (JSON.stringify(normalized(receipt.logs)) !== JSON.stringify(normalized(transaction.receipt.logs))) throw new Error('Receipt log drift');
  receipts.push(receipt);
}
receipts.sort((a, b) => Number(BigInt(a.blockNumber) - BigInt(b.blockNumber)) || Number(BigInt(a.transactionIndex) - BigInt(b.transactionIndex)));
writeFileSync(new URL('fixtures/indexing-receipts.json', root), JSON.stringify({
  schemaVersion: 1, chainId: pinned.chainId, deploymentId: pinned.deploymentId, abiRevision: pinned.abiRevision,
  observedAt: new Date().toISOString(), rpc,
  scope: 'Five full receipts cross-checked against the finalized receipt fixture. Selected transactions, not complete backfill or independent finality proof.',
  receipts,
}, null, 2) + '\n');
console.log(`captured ${receipts.length} matching public receipts`);
