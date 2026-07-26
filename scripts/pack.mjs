import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const packDir = mkdtempSync(resolve(tmpdir(), "launch-on-block-sdk-pack-"));

function exportedPaths(exports, paths = []) {
  if (typeof exports === "string") {
    paths.push(exports.replace(/^\.\//, ""));
    return paths;
  }
  for (const value of Object.values(exports)) exportedPaths(value, paths);
  return paths;
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
  const files = new Set(result.files.map(({ path }) => path));
  const expected = ["CHANGELOG.md", "LICENSE", "README.md", ...exportFiles];
  const missing = expected.filter((path) => !files.has(path));
  if (missing.length > 0) throw new Error(`packed SDK is missing: ${missing.join(", ")}`);

  console.log(`packed ${result.name}@${result.version} with all ${exportFiles.length} exported files`);
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
