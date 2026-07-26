import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { decodeArtifactHandoff } from "./import-artifacts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const expectedPaths = Object.freeze(["src/generated/abis.ts", "src/generated/deployments.ts"]);
const bootstrapProvenanceSha256 = "bd9c9cdc4f800c78f375206f0ebb80b9d398d7bea4c4215e0656fbcf2f16f128";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyCommittedArtifacts({ rootDir = root, trustedAuthorities } = {}) {
  const provenanceBytes = readFileSync(resolve(rootDir, "provenance/current.json"));
  const provenance = JSON.parse(provenanceBytes);
  const artifactBytes = new Map(expectedPaths.map((path) => [path, readFileSync(resolve(rootDir, path))]));

  if (provenance.schemaVersion === 1) {
    if (sha256(provenanceBytes) !== bootstrapProvenanceSha256) {
      throw new Error("legacy provenance is only allowed for the exact immutable bootstrap artifact set");
    }
  } else if (provenance.schemaVersion === 2) {
    const artifacts = provenance.artifacts?.map((artifact) => ({
      ...artifact,
      contentBase64: artifactBytes.get(artifact.path)?.toString("base64"),
    }));
    decodeArtifactHandoff({ ...provenance, artifacts }, { trustedAuthorities });
  } else {
    throw new Error(`unsupported provenance schema version ${provenance.schemaVersion}`);
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

  return Object.freeze({ artifactCount: provenance.artifacts.length, producerId: provenance.producerId, releaseId: provenance.releaseId });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const verified = verifyCommittedArtifacts();
  console.log(`verified ${verified.artifactCount} generated artifacts for ${verified.producerId}/${verified.releaseId}`);
}
