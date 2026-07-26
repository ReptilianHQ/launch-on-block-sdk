import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedPaths = Object.freeze(["src/generated/abis.ts", "src/generated/deployments.ts"]);
const bootstrapProvenanceSha256 = "bd9c9cdc4f800c78f375206f0ebb80b9d398d7bea4c4215e0656fbcf2f16f128";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

  return Object.freeze({ artifactCount: provenance.artifacts.length, producerId: provenance.producerId, releaseId: provenance.releaseId });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verified = verifyCommittedArtifacts();
  console.log(`verified ${verified.artifactCount} generated artifacts for ${verified.producerId}/${verified.releaseId}`);
}
