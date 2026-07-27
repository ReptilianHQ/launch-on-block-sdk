import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const license = readFileSync(resolve(root, "LICENSE"), "utf8");
const notice = readFileSync(resolve(root, "NOTICE"), "utf8");
const packDir = mkdtempSync(resolve(tmpdir(), "launch-on-block-sdk-pack-"));

if (manifest.license !== "Apache-2.0") {
  throw new Error(`expected Apache-2.0 package license, received ${manifest.license}`);
}
if (!license.includes("Apache License") || !license.includes("Version 2.0, January 2004")) {
  throw new Error("LICENSE does not contain the Apache License 2.0 text");
}
if (!notice.includes("Copyright 2026 ReptilianHQ")) {
  throw new Error("NOTICE does not contain the ReptilianHQ copyright attribution");
}

function exportedPaths(exports, paths = []) {
  if (typeof exports === "string") {
    paths.push(exports.replace(/^\.\//, ""));
    return paths;
  }
  for (const value of Object.values(exports)) exportedPaths(value, paths);
  return paths;
}

function directoryFiles(directory, prefix = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    return entry.isDirectory()
      ? directoryFiles(resolve(directory, entry.name), relativePath)
      : [relativePath];
  });
}

try {
  rmSync(resolve(root, "dist"), { recursive: true, force: true });
  const packed = spawnSync(
    "npm",
    ["pack", "--json", "--silent", "--cache", resolve(packDir, "npm-cache"), "--pack-destination", packDir],
    { cwd: root, encoding: "utf8" },
  );
  if (packed.status !== 0) throw new Error(`npm pack failed:\n${packed.stderr || packed.stdout}`);

  const [result] = JSON.parse(packed.stdout);
  if (result.name !== manifest.name || result.version !== manifest.version) {
    throw new Error(`packed identity ${result.name}@${result.version} does not match package.json`);
  }

  const exportFiles = exportedPaths(manifest.exports);
  const literalExportFiles = exportFiles.filter((path) => !path.includes("*"));
  const wildcardExportFiles = exportFiles.filter((path) => path.includes("*"));
  const files = new Set(result.files.map(({ path }) => path));
  const expected = ["CHANGELOG.md", "LICENSE", "NOTICE", "README.md", ...literalExportFiles];
  const missing = expected.filter((path) => !files.has(path));
  if (missing.length > 0) throw new Error(`packed SDK is missing: ${missing.join(", ")}`);
  const unmatchedWildcardExports = wildcardExportFiles.filter((pattern) => {
    const [prefix, suffix] = pattern.split("*");
    return ![...files].some((path) => path.startsWith(prefix) && path.endsWith(suffix));
  });
  if (unmatchedWildcardExports.length > 0) {
    throw new Error(`packed SDK has unmatched wildcard exports: ${unmatchedWildcardExports.join(", ")}`);
  }
  const indexingFiles = directoryFiles(resolve(root, "indexing")).map((path) => `indexing/${path}`);
  const missingIndexingFiles = indexingFiles.filter((path) => !files.has(path));
  if (missingIndexingFiles.length > 0) {
    throw new Error(`packed SDK is missing indexing artifacts: ${missingIndexingFiles.join(", ")}`);
  }

  const internalVerificationFiles = ["dist/generated/abis.js", "dist/generated/abis.d.ts"];
  const missingInternalVerificationFiles = internalVerificationFiles.filter((path) => !files.has(path));
  if (missingInternalVerificationFiles.length > 0) {
    throw new Error(
      `packed SDK is missing internal verification artifacts: ${missingInternalVerificationFiles.join(", ")}`,
    );
  }
  const generatedExports = Object.keys(manifest.exports).filter((path) => path.startsWith("./generated"));
  if (generatedExports.length > 0) {
    throw new Error(`generated verification artifacts must not be public exports: ${generatedExports.join(", ")}`);
  }

  console.log(
    `packed ${result.name}@${result.version} with all ${exportFiles.length} export targets and internal verification artifacts`,
  );
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
