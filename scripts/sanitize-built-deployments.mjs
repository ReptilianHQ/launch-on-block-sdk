import { rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedDirectory = resolve(root, "dist/generated");
const deploymentModule = await import(pathToFileURL(resolve(root, "dist/deployments.js")).href);
const contents = [
  "// Derived from the immutable reviewed deployment input during build.",
  `export const deploymentManifest = ${JSON.stringify(deploymentModule.deploymentManifest, null, 2)};`,
  "",
].join("\n");

writeFileSync(resolve(generatedDirectory, "deployments.js"), contents);
for (const filename of ["deployments.js.map", "deployments.d.ts", "deployments.d.ts.map"]) {
  rmSync(resolve(generatedDirectory, filename), { force: true });
}
