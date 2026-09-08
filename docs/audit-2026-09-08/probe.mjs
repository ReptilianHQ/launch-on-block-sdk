// Run from the repository root after npm run build. Only public, read-only RPC calls.
// JSONL records preserve every request/result, including errors; this is not a release gate.
import { execFileSync } from "node:child_process";
import { createPublicClient, custom, toHex } from "viem";
import { assertCompatibleDeployment, getDeployment } from "../../dist/index.js";

const emit = (record) => console.log(JSON.stringify(record, (_, value) =>
  typeof value === "bigint" ? value.toString() : value));
emit({ kind: "run", observedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
  node: process.version, scope: "RPC state availability, bounded historical logs, SDK compatibility" });
let id = 0;
for (const chainId of [4663, 46630]) {
  const deployment = getDeployment(chainId);
  const request = async ({ method, params = [] }) => {
    const requestId = ++id;
    const observedAt = new Date().toISOString();
    let response;
    try {
      const httpResponse = await fetch(deployment.rpcUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
        signal: AbortSignal.timeout(20000),
      });
      if (!httpResponse.ok) throw new Error(`HTTP ${httpResponse.status}`);
      response = await httpResponse.json();
    } catch (error) {
      emit({ kind: "rpc", chainId, observedAt, id: requestId, method, params,
        transportError: error.message });
      throw error;
    }
    emit({ kind: "rpc", chainId, observedAt, id: requestId, method, params, response });
    if (response.error) throw Object.assign(new Error(response.error.message), response.error);
    return response.result;
  };
  const check = async (label, fn) => {
    try {
      const result = await fn();
      emit({ kind: "check", chainId, label, status: "ok", result });
      return result;
    } catch (error) {
      emit({ kind: "check", chainId, label, status: "error", message: error.message });
      return null;
    }
  };
  const latest = await check("latest", () => request({ method: "eth_getBlockByNumber", params: ["latest", false] }));
  const safe = await check("safe", () => request({ method: "eth_getBlockByNumber", params: ["safe", false] }));
  if (!latest?.number || !safe?.number) continue;
  const height = BigInt(latest.number);
  emit({ kind: "lag", chainId, latest: height, safe: BigInt(safe.number), blocks: height - BigInt(safe.number) });
  for (const [label, block] of [["safe-code", safe.number],
    ...[50n, 6000n, 7000n].map((depth) => [`latest-minus-${depth}-code`, toHex(height - depth)])]) {
    await check(label, () => request({ method: "eth_getCode", params: [deployment.contracts.launchpad, block] }));
  }
  // Historical event retrieval is a separate capability from historical state retrieval.
  // A successful small range does not establish that an entire backfill will succeed.
  const start = BigInt(deployment.contracts.startBlock);
  await check("historical-logs-first-17-blocks", () => request({ method: "eth_getLogs", params: [{
    address: deployment.contracts.launchpad, fromBlock: toHex(start), toBlock: toHex(start + 16n),
  }] }));
  const client = createPublicClient({ transport: custom({ request }, { retryCount: 0 }) });
  await check("compatibility-default-safe", () => assertCompatibleDeployment(client, deployment));
  // Diagnostic only: latest-50 does not carry safe/finalized guarantees and is not a fallback policy.
  await check("compatibility-explicit-latest-minus-50", () =>
    assertCompatibleDeployment(client, deployment, { blockNumber: height - 50n }));
}
