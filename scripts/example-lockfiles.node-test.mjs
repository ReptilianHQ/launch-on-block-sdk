import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { validateExampleLockfile, validateExamplePackageFiles } from "./example-lockfiles.mjs";

const manifest = {
  name: "example",
  engines: { node: ">=22" },
  dependencies: { runtime: "1.0.0" },
  devDependencies: { tooling: "2.0.0" },
};

function validLockfile() {
  return {
    lockfileVersion: 3,
    packages: { "": structuredClone(manifest) },
  };
}

test("accepts a lockfile whose root mirrors the manifest", () => {
  assert.doesNotThrow(() => validateExampleLockfile(manifest, validLockfile()));
});

test("rejects a missing root package", () => {
  assert.throws(
    () => validateExampleLockfile(manifest, { lockfileVersion: 3, packages: {} }),
    /missing its root package entry/,
  );
});

test("rejects stale dependency metadata", () => {
  const lockfile = validLockfile();
  lockfile.packages[""].dependencies.runtime = "0.9.0";
  assert.throws(
    () => validateExampleLockfile(manifest, lockfile),
    /root dependencies does not match package\.json/,
  );
});

test("rejects a missing lockfile on disk", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "launch-on-block-example-lock-"));
  try {
    writeFileSync(resolve(directory, "package.json"), JSON.stringify(manifest));
    assert.throws(
      () => validateExamplePackageFiles(directory, "package.json", "package-lock.json"),
      /required example lockfile is missing/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
