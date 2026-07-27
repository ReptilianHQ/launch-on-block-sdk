import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const license = readFileSync(resolve(root, "LICENSE"), "utf8");
const notice = readFileSync(resolve(root, "NOTICE"), "utf8");
const packDir = mkdtempSync(resolve(tmpdir(), "launch-on-block-sdk-pack-"));
const expectedLicenseSha256 = "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30";
const expectedNotice = [
  "Launch On Block SDK",
  "Copyright 2026 Tyler Wanner",
  "",
  "This product includes software developed for the Launch On Block protocol.",
  "",
].join("\n");

if (manifest.license !== "Apache-2.0") {
  throw new Error(`expected Apache-2.0 package license, received ${manifest.license}`);
}
const licenseSha256 = createHash("sha256").update(license).digest("hex");
if (licenseSha256 !== expectedLicenseSha256) {
  throw new Error(`LICENSE does not match the canonical Apache-2.0 text: ${licenseSha256}`);
}
if (notice !== expectedNotice) {
  throw new Error("NOTICE does not match the reviewed copyright attribution");
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

  const internalVerificationFiles = [
    "dist/generated/abis.js",
    "dist/generated/abis.d.ts",
    "dist/generated/deployments.js",
  ];
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

  const forbiddenGeneratedDeploymentFiles = [
    "dist/generated/deployments.js.map",
    "dist/generated/deployments.d.ts",
    "dist/generated/deployments.d.ts.map",
  ].filter((path) => files.has(path));
  if (forbiddenGeneratedDeploymentFiles.length > 0) {
    throw new Error(`packed SDK contains unsanitized deployment artifacts: ${forbiddenGeneratedDeploymentFiles.join(", ")}`);
  }

  const publicDeploymentContents = [
    readFileSync(resolve(root, "dist/deployments.d.ts"), "utf8"),
    readFileSync(resolve(root, "dist/generated/deployments.js"), "utf8"),
  ].join("\n");
  const forbiddenDeploymentTerms = [
    "writes_enabled",
    "release_authorities",
    "deployer_address",
    "max_managed_native",
    "chain_data",
  ];
  const leakedDeploymentTerms = forbiddenDeploymentTerms.filter((term) => publicDeploymentContents.includes(term));
  if (leakedDeploymentTerms.length > 0) {
    throw new Error(`packed SDK leaks internal deployment fields: ${leakedDeploymentTerms.join(", ")}`);
  }

  const extracted = spawnSync("tar", ["-xzf", resolve(packDir, result.filename), "-C", packDir], {
    encoding: "utf8",
  });
  if (extracted.status !== 0) throw new Error(`packed SDK extraction failed:\n${extracted.stderr || extracted.stdout}`);
  const packagedDeployments = await import(
    `${pathToFileURL(resolve(packDir, "package/dist/deployments.js")).href}?integrity=${result.integrity}`
  );
  const packagedMainnet = packagedDeployments.getDeployment(4663);
  const packagedManifest = JSON.stringify(packagedDeployments.deploymentManifest);
  if (packagedMainnet.contracts === null || packagedMainnet.contracts.launchpad.length !== 42) {
    throw new Error("packed deployment module did not return the reviewed mainnet deployment");
  }
  const leakedPackagedTerms = forbiddenDeploymentTerms.filter((term) => packagedManifest.includes(term));
  if (leakedPackagedTerms.length > 0) {
    throw new Error(`executed packed SDK leaks internal deployment fields: ${leakedPackagedTerms.join(", ")}`);
  }

  console.log(
    `packed ${result.name}@${result.version} with all ${exportFiles.length} export targets and internal verification artifacts`,
  );
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
