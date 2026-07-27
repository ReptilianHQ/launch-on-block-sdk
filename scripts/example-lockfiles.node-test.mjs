import assert from "node:assert/strict";
import test from "node:test";

import { validateExampleLockfile } from "./example-lockfiles.mjs";

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
