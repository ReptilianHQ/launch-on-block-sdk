import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const provenance = JSON.parse(readFileSync(resolve(root, "provenance/current.json"), "utf8"));

if (provenance.schemaVersion !== 1) {
  throw new Error(`unsupported provenance schema version ${provenance.schemaVersion}`);
}
if (provenance.producerId !== "launch-on-block-contracts") {
  throw new Error("provenance producerId is not canonical");
}
if (!/^sha256:[0-9a-f]{64}$/.test(provenance.abiRevision)) {
  throw new Error("provenance abiRevision must be a SHA-256 identity");
}

for (const artifact of provenance.artifacts) {
  if (artifact.path.includes("..") || artifact.path.startsWith("/")) {
    throw new Error(`unsafe artifact path ${artifact.path}`);
  }
  const bytes = readFileSync(resolve(root, artifact.path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== artifact.sha256) {
    throw new Error(`${artifact.path} hash mismatch: expected ${artifact.sha256}, received ${actual}`);
  }
}

const abiSource = readFileSync(resolve(root, "src/generated/abis.ts"), "utf8");
const revisionMatch = abiSource.match(/export const ABI_REVISION = "(sha256:[0-9a-f]{64})" as const;/);
if (!revisionMatch || revisionMatch[1] !== provenance.abiRevision) {
  throw new Error("generated ABI revision does not match bootstrap provenance");
}

const deploymentSource = readFileSync(resolve(root, "src/generated/deployments.ts"), "utf8");
if (!deploymentSource.includes(`"abi_revision": "${provenance.abiRevision}"`)) {
  throw new Error("generated deployment metadata does not contain the attested ABI revision");
}
if (!deploymentSource.includes(`"deployment_id": "${provenance.deploymentId}"`)) {
  throw new Error("generated deployment metadata does not contain the attested deployment identity");
}

console.log(`verified ${provenance.artifacts.length} generated artifacts for ${provenance.producerId}/${provenance.releaseId}`);
