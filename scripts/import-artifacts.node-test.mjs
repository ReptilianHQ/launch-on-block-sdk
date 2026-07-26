import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { canonicalJsonBytes, decodeArtifactHandoff, writeArtifactImport } from "./import-artifacts.mjs";
import { verifyCommittedArtifacts } from "./check-artifacts.mjs";

const revision = "sha256:635cf660979631c57c4fa5cdf28460f8a4293272ebe153f0064e3758c6a5b9be";
const deploymentId = "4663:launchpad:0x135492b3ccb2cb64749f91332f929f49a1deed3f:17957183";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
const trustedAuthorities = [{
  id: "launch-on-block-contracts",
  keys: [{ id: "test-key", algorithm: "Ed25519", publicKeyPem }],
}];

function artifact(path, contents = readFileSync(new URL(`../${path}`, import.meta.url))) {
  const bytes = Buffer.from(contents);
  return { path, sha256: createHash("sha256").update(bytes).digest("hex"), contentBase64: bytes.toString("base64") };
}

function signed(value) {
  const signature = sign(null, canonicalJsonBytes(value), privateKey).toString("base64");
  return { ...value, signature: { algorithm: "Ed25519", keyId: "test-key", valueBase64: signature } };
}

function handoff() {
  return signed({
    schemaVersion: 2,
    producerId: "launch-on-block-contracts",
    releaseId: "gen-12",
    chainId: 4663,
    deploymentId,
    startBlock: 17957183,
    abiRevision: revision,
    artifacts: [
      artifact("src/generated/abis.ts"),
      artifact("src/generated/deployments.ts"),
    ],
  });
}

function decode(value) {
  return decodeArtifactHandoff(value, { trustedAuthorities });
}

test("accepts a complete signed handoff and strips embedded bytes from provenance", () => {
  const decoded = decode(handoff());
  assert.equal(decoded.files.size, 2);
  assert.equal(decoded.provenance.artifacts[0].contentBase64, undefined);
  assert.equal(decoded.provenance.signature.keyId, "test-key");
});

test("rejects tampered payloads and an untrusted signer", () => {
  const tampered = handoff();
  tampered.releaseId = "gen-13";
  assert.throws(() => decode(tampered), /signature verification failed/);

  const wrongSigner = handoff();
  wrongSigner.signature.keyId = "other-key";
  assert.throws(() => decode(wrongSigner), /signature key is not trusted/);
});

test("rejects modified, malformed, duplicate, and incomplete artifacts", () => {
  const modified = handoff();
  delete modified.signature;
  modified.artifacts[0].contentBase64 = Buffer.from("modified").toString("base64");
  assert.throws(() => decode(signed(modified)), /hash mismatch/);

  const malformed = handoff();
  delete malformed.signature;
  malformed.artifacts[0].contentBase64 = "not-base64";
  assert.throws(() => decode(signed(malformed)), /canonical base64/);

  const duplicatePayload = { ...handoff(), artifacts: [artifact("src/generated/abis.ts"), artifact("src/generated/abis.ts")] };
  delete duplicatePayload.signature;
  assert.throws(() => decode(signed(duplicatePayload)), /unexpected or duplicate path/);

  const incompletePayload = { ...handoff(), artifacts: [artifact("src/generated/abis.ts")] };
  delete incompletePayload.signature;
  assert.throws(() => decode(signed(incompletePayload)), /complete generated artifact set/);
});

test("rejects TypeScript identity spoofing outside the canonical generated structure", () => {
  const payload = handoff();
  delete payload.signature;
  const original = Buffer.from(payload.artifacts[1].contentBase64, "base64").toString("utf8");
  payload.artifacts[1] = artifact(
    "src/generated/deployments.ts",
    `${original}// ${JSON.stringify({ deployment_id: deploymentId, abi_revision: revision })}\n`,
  );
  assert.throws(() => decode(signed(payload)), /non-canonical TypeScript/);
});

test("rolls back the complete import when a staged rename fails", () => {
  const decoded = decode(handoff());
  const rootDir = mkdtempSync(resolve(tmpdir(), "sdk-import-"));
  mkdirSync(resolve(rootDir, "src/generated"), { recursive: true });
  mkdirSync(resolve(rootDir, "provenance"), { recursive: true });
  for (const path of ["src/generated/abis.ts", "src/generated/deployments.ts", "provenance/current.json"]) {
    writeFileSync(resolve(rootDir, path), `old:${path}`);
  }
  let renames = 0;
  assert.throws(() => writeArtifactImport(decoded, {
    rootDir,
    rename: (from, to) => {
      renames += 1;
      if (renames === 2) throw new Error("simulated rename failure");
      renameSync(from, to);
    },
  }), /simulated rename failure/);
  for (const path of ["src/generated/abis.ts", "src/generated/deployments.ts", "provenance/current.json"]) {
    assert.equal(readFileSync(resolve(rootDir, path), "utf8"), `old:${path}`);
  }
});

test("CI rejects manual edits that merely replace self-declared legacy hashes", () => {
  const rootDir = mkdtempSync(resolve(tmpdir(), "sdk-check-"));
  mkdirSync(resolve(rootDir, "src/generated"), { recursive: true });
  mkdirSync(resolve(rootDir, "provenance"), { recursive: true });
  const abis = Buffer.concat([readFileSync(new URL("../src/generated/abis.ts", import.meta.url)), Buffer.from("// manual edit\n")]);
  writeFileSync(resolve(rootDir, "src/generated/abis.ts"), abis);
  writeFileSync(resolve(rootDir, "src/generated/deployments.ts"), readFileSync(new URL("../src/generated/deployments.ts", import.meta.url)));
  const provenance = JSON.parse(readFileSync(new URL("../provenance/current.json", import.meta.url)));
  provenance.artifacts.find(({ path }) => path === "src/generated/abis.ts").sha256 = createHash("sha256").update(abis).digest("hex");
  writeFileSync(resolve(rootDir, "provenance/current.json"), `${JSON.stringify(provenance, null, 2)}\n`);
  assert.throws(() => verifyCommittedArtifacts({ rootDir }), /exact immutable bootstrap artifact set/);
});

test("CI reconstructs and authenticates committed schema-v2 artifact bytes", () => {
  const rootDir = mkdtempSync(resolve(tmpdir(), "sdk-check-v2-"));
  mkdirSync(resolve(rootDir, "src/generated"), { recursive: true });
  mkdirSync(resolve(rootDir, "provenance"), { recursive: true });
  writeArtifactImport(decode(handoff()), { rootDir });
  const verified = verifyCommittedArtifacts({ rootDir, trustedAuthorities });
  assert.equal(verified.artifactCount, 2);

  const provenancePath = resolve(rootDir, "provenance/current.json");
  const provenance = JSON.parse(readFileSync(provenancePath));
  provenance.releaseId = "gen-13";
  writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
  assert.throws(() => verifyCommittedArtifacts({ rootDir, trustedAuthorities }), /signature verification failed/);
});
