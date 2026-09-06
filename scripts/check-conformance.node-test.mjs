import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

// scripts/check-conformance.mjs is an emitted copy of the shared Protocol SDK
// Standard's conformance script. Its header records the sha256 of the rule body.
// The source repository checks this copy against the canonical rules; this test
// catches the other direction, a local edit that quietly changes what the
// package is checked against. Re-emit the file from the source instead of
// editing it here.

const SHEBANG = "#!/usr/bin/env node\n";
const HEADER_MARKER = "// Canonical body sha256:";
const source = readFileSync(new URL("./check-conformance.mjs", import.meta.url), "utf8");

test("the vendored conformance script body matches the hash recorded in its header", () => {
  assert.ok(source.startsWith(SHEBANG), "vendored script must keep its shebang");
  const lines = source.slice(SHEBANG.length).replace(/^\n+/u, "").split("\n");
  const markerIndex = lines.findIndex((line) => line.startsWith(HEADER_MARKER));
  assert.notEqual(markerIndex, -1, "vendored script must carry the canonical body hash header");
  const recorded = lines[markerIndex].slice(HEADER_MARKER.length).trim();
  const body = lines.slice(markerIndex + 1).join("\n").replace(/^\n+/u, "");
  assert.match(recorded, /^[0-9a-f]{64}$/u);
  assert.equal(createHash("sha256").update(body).digest("hex"), recorded, "body edited without re-emitting from the source");
});

test("the vendored conformance script still exposes the rule set the check script invokes", async () => {
  const module = await import("./check-conformance.mjs");
  assert.ok(Array.isArray(module.requiredCapabilityExports));
  assert.ok(Array.isArray(module.requiredInvariantSuites));
  assert.equal(typeof module.checkSdkPackage, "function");
});
