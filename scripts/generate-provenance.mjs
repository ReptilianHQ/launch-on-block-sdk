import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Publishes the SDK_STANDARDS.md-required `./provenance/<network>.json` capability from the
// already-sanitized public deployment manifest (see PublicDeploymentManifest in deployments.ts) —
// no additional field selection happens here, so nothing new can leak past check:public.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const provenanceDirectory = resolve(root, "dist/provenance");
const { deploymentManifest } = await import(pathToFileURL(resolve(root, "dist/deployments.js")).href);

rmSync(provenanceDirectory, { recursive: true, force: true });
mkdirSync(provenanceDirectory, { recursive: true });

for (const [environment, network] of Object.entries(deploymentManifest.robinhood)) {
  const document = { schema_version: deploymentManifest.schema_version, ...network };
  writeFileSync(resolve(provenanceDirectory, `${environment}.json`), `${JSON.stringify(document, null, 2)}\n`);
}
