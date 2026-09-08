import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { verifyCommittedArtifacts, verifyDeploymentMetadata } from "./check-artifacts.mjs";

const source = readFileSync(new URL("../src/generated/deployments.ts", import.meta.url), "utf8");
const manifest = JSON.parse(source.match(/^export const deploymentManifest = (\{[\s\S]*\}) as const;\s*$/m)[1]);
const metadata = JSON.parse(readFileSync(new URL("../provenance/deployment-metadata.json", import.meta.url), "utf8"));
const evidence = gunzipSync(readFileSync(new URL("../docs/audit-2026-09-08/rpc-evidence.jsonl.gz", import.meta.url)))
  .toString("utf8").trim().split("\n").map((line) => JSON.parse(line));

test("immutable artifact hashes and corrected metadata verify together", () => {
  assert.equal(verifyCommittedArtifacts().artifactCount, 2);
  assert.equal(verifyDeploymentMetadata(manifest, metadata, evidence).testnet.launchpad,
    manifest.robinhood.testnet.contracts.launchpad.toLowerCase());
  assert.notEqual(metadata.networks.testnet.launchpad,
    manifest.robinhood.testnet.chain_data.launchpad.toLowerCase());
});

test("stale launchpad, boundary, and deployment ID cannot re-enter corrected metadata", () => {
  for (const [field, value] of Object.entries({
    launchpad: manifest.robinhood.testnet.chain_data.launchpad.toLowerCase(),
    startBlock: manifest.robinhood.testnet.chain_data.start_block,
    deploymentId: manifest.robinhood.testnet.chain_data.deployment_id,
  })) {
    const changed = structuredClone(metadata);
    changed.networks.testnet[field] = value;
    assert.throws(() => verifyDeploymentMetadata(manifest, changed, evidence), /testnet.*published contract identity/);
  }
});

test("wrong timelock, missing evidence, and wrong evidence block fail closed", () => {
  const changed = structuredClone(metadata);
  changed.networks.testnet.timelock = manifest.robinhood.testnet.release_authorities.timelock.address;
  assert.throws(() => verifyDeploymentMetadata(manifest, changed, evidence), /testnet.*compatibility evidence/);
  assert.throws(() => verifyDeploymentMetadata(manifest, metadata, []), /compatibility evidence/);
  changed.networks.testnet = { ...metadata.networks.testnet, observedAtBlock: "1" };
  assert.throws(() => verifyDeploymentMetadata(manifest, changed, evidence), /testnet.*compatibility evidence/);
});

test("both networks must remain covered and mainnet identity is checked too", () => {
  const changed = structuredClone(metadata);
  delete changed.networks.testnet;
  assert.throws(() => verifyDeploymentMetadata(manifest, changed, evidence), /both published networks/);
  changed.networks.testnet = metadata.networks.testnet;
  changed.networks.mainnet.startBlock += 1;
  assert.throws(() => verifyDeploymentMetadata(manifest, changed, evidence), /mainnet.*published contract identity/);
});
