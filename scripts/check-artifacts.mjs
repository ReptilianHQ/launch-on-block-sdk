import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedPaths = Object.freeze(["src/generated/abis.ts", "src/generated/deployments.ts"]);
const bootstrapProvenanceSha256 = "bd9c9cdc4f800c78f375206f0ebb80b9d398d7bea4c4215e0656fbcf2f16f128";
// Additive metadata corrections keep the original producer artifact and its bootstrap hash intact.
const deploymentMetadataSha256 = "9fd97bc3af5fb1d08382d50b62ae67378bb49e06521b18844c88f64bfc3a34c2";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyDeploymentMetadata(manifest, metadata, evidence) {
  if (metadata.schemaVersion !== 1
    || Object.keys(metadata.networks).sort().join(",") !== "mainnet,testnet"
    || Object.keys(manifest.robinhood).sort().join(",") !== "mainnet,testnet") {
    throw new Error("deployment metadata must cover both published networks");
  }
  for (const [name, network] of Object.entries(manifest.robinhood)) {
    const current = metadata.networks[name];
    const contracts = network.contracts;
    const expectedId = `${network.chain_id}:launchpad:${contracts.launchpad.toLowerCase()}:${contracts.start_block}`;
    if (current.chainId !== network.chain_id || current.deploymentId !== expectedId
      || current.launchpad !== contracts.launchpad.toLowerCase() || current.startBlock !== contracts.start_block) {
      throw new Error(`${name} deployment metadata disagrees with the published contract identity`);
    }
    const observation = evidence.find((record) => record.kind === "check" && record.chainId === current.chainId
      && record.label === "compatibility-explicit-latest-minus-50" && record.status === "ok"
      && record.result.blockNumber === current.observedAtBlock)?.result;
    if (!observation || observation.chainId !== current.chainId
      || observation.releaseId !== contracts.release_id || observation.abiRevision !== contracts.abi_revision
      || observation.pointers.launchpadGovernance.toLowerCase() !== current.timelock
      || observation.pointers.proxyUpgradeGateTimelock.toLowerCase() !== current.timelock) {
      throw new Error(`${name} timelock metadata lacks matching compatibility evidence`);
    }
  }
  return metadata.networks;
}

export function verifyCommittedArtifacts({ rootDir = root } = {}) {
  const provenanceBytes = readFileSync(resolve(rootDir, "provenance/current.json"));
  const provenance = JSON.parse(provenanceBytes);
  const artifactBytes = new Map(expectedPaths.map((path) => [path, readFileSync(resolve(rootDir, path))]));

  if (provenance.schemaVersion !== 1 || sha256(provenanceBytes) !== bootstrapProvenanceSha256) {
    throw new Error("provenance must match the exact immutable bootstrap artifact set");
  }

  if (!Array.isArray(provenance.artifacts)
    || provenance.artifacts.length !== expectedPaths.length
    || expectedPaths.some((path) => !provenance.artifacts.some((artifact) => artifact.path === path))) {
    throw new Error("provenance must cover the complete generated artifact set");
  }
  for (const artifact of provenance.artifacts) {
    if (!expectedPaths.includes(artifact.path)) throw new Error(`unsafe artifact path ${artifact.path}`);
    const actual = sha256(artifactBytes.get(artifact.path));
    if (actual !== artifact.sha256) {
      throw new Error(`${artifact.path} hash mismatch: expected ${artifact.sha256}, received ${actual}`);
    }
  }

  const abiSource = artifactBytes.get("src/generated/abis.ts").toString("utf8");
  if (!abiSource.includes(`export const ABI_REVISION = "${provenance.abiRevision}" as const;`)) {
    throw new Error("generated ABI revision does not match current provenance");
  }
  const deploymentSource = artifactBytes.get("src/generated/deployments.ts").toString("utf8");
  if (!deploymentSource.includes(`"deployment_id": "${provenance.deploymentId}"`)
    || !deploymentSource.includes(`"abi_revision": "${provenance.abiRevision}"`)) {
    throw new Error("generated deployment metadata does not match current provenance");
  }

  const metadataBytes = readFileSync(resolve(rootDir, "provenance/deployment-metadata.json"));
  if (sha256(metadataBytes) !== deploymentMetadataSha256) {
    throw new Error("deployment metadata must match the reviewed correction record");
  }
  const metadata = JSON.parse(metadataBytes);
  if (metadata.sourceArtifactSha256 !== sha256(artifactBytes.get("src/generated/deployments.ts"))) {
    throw new Error("deployment metadata corrections must bind the immutable source artifact");
  }
  const evidenceBytes = gunzipSync(readFileSync(resolve(rootDir, "docs/audit-2026-09-08/rpc-evidence.jsonl.gz")));
  if (sha256(evidenceBytes) !== metadata.evidenceSha256) {
    throw new Error("deployment metadata evidence hash mismatch");
  }
  // The generated input is a JSON literal with a TypeScript wrapper; never evaluate source code.
  const literal = deploymentSource.match(/^export const deploymentManifest = (\{[\s\S]*\}) as const;\s*$/m)?.[1];
  if (!literal) throw new Error("generated deployment input must remain a JSON literal");
  verifyDeploymentMetadata(JSON.parse(literal), metadata,
    evidenceBytes.toString("utf8").trim().split("\n").map((line) => JSON.parse(line)));

  return Object.freeze({ artifactCount: provenance.artifacts.length, producerId: provenance.producerId, releaseId: provenance.releaseId });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verified = verifyCommittedArtifacts();
  console.log(`verified ${verified.artifactCount} immutable artifacts and both networks' corrected metadata for ${verified.producerId}/${verified.releaseId}`);
}
