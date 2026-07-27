import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lockfile = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
const rootLockPackage = lockfile.packages?.[""];

if (manifest.version !== rootLockPackage?.version || manifest.license !== rootLockPackage?.license) {
  throw new Error("package and lockfile identity must agree");
}
if (manifest.packageManager !== "npm@11.16.0") {
  throw new Error("repository package manager must remain pinned to npm 11.16.0");
}

const publicDeploymentFiles = [
  resolve(root, "dist/deployments.d.ts"),
  resolve(root, "dist/generated/deployments.js"),
];
const forbiddenTerms = [
  "writes_enabled",
  "release_authorities",
  "deployer_address",
  "max_managed_native",
  "chain_data",
];
for (const path of publicDeploymentFiles) {
  const contents = readFileSync(path, "utf8");
  const leaked = forbiddenTerms.filter((term) => contents.includes(term));
  if (leaked.length > 0) throw new Error(`${path} leaks internal deployment fields: ${leaked.join(", ")}`);
}

for (const filename of ["deployments.js.map", "deployments.d.ts", "deployments.d.ts.map"]) {
  const path = resolve(root, "dist/generated", filename);
  if (existsSync(path)) throw new Error(`sanitized deployment build retained ${path}`);
}

function filesWithin(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesWithin(path) : [path];
  });
}

const declarationMaps = filesWithin(resolve(root, "dist")).filter((path) => path.endsWith(".d.ts.map"));
if (declarationMaps.length > 0) {
  throw new Error(`package contains declaration maps that point outside the tarball: ${declarationMaps.join(", ")}`);
}
const sourceMaps = filesWithin(resolve(root, "dist")).filter((path) => path.endsWith(".js.map"));
for (const path of sourceMaps) {
  const map = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(map.sourcesContent) || map.sourcesContent.some((source) => typeof source !== "string")) {
    throw new Error(`${path} references source files without embedding their contents`);
  }
}

for (const path of [
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/integration_request.yml",
  ".github/pull_request_template.md",
  "examples/envio/package-lock.json",
  "examples/graph/package-lock.json",
]) {
  if (!existsSync(resolve(root, path))) throw new Error(`public repository is missing ${path}`);
}

console.log(`verified the public package boundary and ${sourceMaps.length} self-contained source maps`);
