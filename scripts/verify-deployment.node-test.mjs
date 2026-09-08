import assert from "node:assert/strict";
import test from "node:test";
import { getDeployment, SdkError } from "../dist/index.js";
import { verifyDeploymentWithRetry } from "./verify-deployment.mjs";

const deployment = getDeployment(4663);

test("persistent unavailable state retries only safe blocks, then fails with an actionable error", async () => {
  const blocks = [];
  const waits = [];
  const retries = [];
  const client = {
    getChainId: async () => 4663,
    getBlock: async (options) => { blocks.push(options); return { number: 100n + BigInt(blocks.length) }; },
    getBytecode: async () => { throw new Error("RPC error", { cause: new Error("metadata is not found") }); },
  };
  await assert.rejects(verifyDeploymentWithRetry(client, deployment, {
    wait: async (ms) => { waits.push(ms); }, onRetry: (attempt) => retries.push(attempt),
  }), /after 3 attempts.*VERIFY_RPC.*Verification did not pass/);
  assert.deepEqual(blocks, [{ blockTag: "safe" }, { blockTag: "safe" }, { blockTag: "safe" }]);
  assert.deepEqual(waits, [2000, 2000]);
  assert.deepEqual(retries, [1, 2]);
});

test("a successful retry returns the actual verifier result without overriding its block selection", async () => {
  let attempts = 0;
  const report = { chainId: 4663, blockNumber: 123n };
  const client = {};
  const result = await verifyDeploymentWithRetry(client, deployment, {
    verify: async (...args) => {
      assert.deepEqual(args, [client, deployment]);
      if (++attempts === 1) throw new Error("missing trie node");
      return report;
    }, wait: async () => {},
  });
  assert.equal(result, report);
  assert.equal(attempts, 2);
});

test("SDK incompatibility and unrelated RPC errors never retry", async () => {
  for (const error of [
    new SdkError("CODE_HASH_MISMATCH", "metadata is not found in expected identity"),
    new Error("metadata is not found", { cause: new SdkError("CHAIN_MISMATCH", "wrong chain") }),
    new Error("HTTP 401"),
  ]) {
    let attempts = 0;
    await assert.rejects(verifyDeploymentWithRetry({}, deployment, {
      verify: async () => { attempts += 1; throw error; },
      wait: async () => assert.fail("must not wait"),
    }), (actual) => actual === error);
    assert.equal(attempts, 1);
  }
});
