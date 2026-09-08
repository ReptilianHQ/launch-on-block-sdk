import assert from "node:assert/strict";
import { toHex } from "viem";
import { robinhoodTestnet } from "@reptilianhq/launch-on-block-sdk/deployments";
import { calculateSlippageFloor } from "@reptilianhq/launch-on-block-sdk/economics";
import { buildClaimTransaction, decodeLaunchpadTransaction } from "@reptilianhq/launch-on-block-sdk/transactions";
import { mineLaunchTokenVanitySalt, predictLaunchTokenAddress } from "@reptilianhq/launch-on-block-sdk/vanity";

const launchpad = robinhoodTestnet.contracts.launchpad;
assert.equal(calculateSlippageFloor(10_000n, 100), 9_900n); // 100 bps = 1%; raw units.
assert.equal(decodeLaunchpadTransaction(buildClaimTransaction(launchpad).data).functionName, "claim");
const token = "0x1111111111111111111111111111111111111111" as const; // Encoding example only.
assert.equal(decodeLaunchpadTransaction(buildClaimTransaction(launchpad, token).data).functionName, "claimAll");

const parameters = {
  launchpad, creator: "0x2222222222222222222222222222222222222222" as const,
  name: "Example Token", symbol: "EXAMPLE", metadataUri: "https://example.com/token.json",
};
const address = predictLaunchTokenAddress({ ...parameters, salt: toHex(1n, { size: 32 }) });
const startSalt = 1n;
const maxAttempts = 10;
const result = mineLaunchTokenVanitySalt({ ...parameters, suffix: address.slice(-1), startSalt, maxAttempts });
assert.ok(result); // The first candidate is known to match this chosen demonstration suffix.
assert.equal(result.address.toLowerCase(), address.toLowerCase());
// For an arbitrary suffix, null means try startSalt + BigInt(maxAttempts) next, subject to uint256 bounds.
console.log("Offline encoding, arithmetic, and vanity examples passed.");
