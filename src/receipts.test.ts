import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getAddress, type Address, type Hex } from "viem";
import { getDeployment, ROBINHOOD_CHAIN_ID } from "./deployments.js";
import { SdkError } from "./errors.js";
import {
  verifyBuyReceipt,
  verifyCurveSelectedReceipt,
  verifyFeesCollectedReceipt,
  verifyGraduatedReceipt,
  verifyLaunchCreatedReceipt,
  verifyLaunchCreationReceipt,
  verifyRouterSwapReceipt,
  verifySellReceipt,
  type ReceiptLike,
} from "./receipts.js";

// Pinned finalized receipts: one real, mined Robinhood Chain mainnet transaction per
// verify*Receipt function, decoded through the pinned ABI and classified as matched, with
// the returned evidence asserted against what the function actually returns. See
// docs/SDK_STANDARDS.md "Pinned finalized receipts (required now)". Property suites in
// receipts.hegel.test.ts prove the rejection logic; this file proves the encoding.
//
// Several verifiers share one transaction (LaunchCreated/CurveSelected/the combined launch
// receipt come from a single createLaunch call; Sell/Swap come from a single router-routed
// sell), so transactions are stored once under `transactions` and `receipts` fixtures
// reference one by hash. A field over LONG_STRING_THRESHOLD chars (this protocol allows an
// arbitrary metadata URI, which can embed a data: image) is stored as a length+hash digest
// rather than verbatim, to keep this file from carrying an unrelated launch's embedded image
// forever while still proving the decode is byte-exact.

interface PinnedTransaction {
  blockNumber: string;
  explorerUrl: string;
  receipt: { status: "reverted" | "success"; logs: Array<{ address: Address; topics: Hex[]; data: Hex }> };
}

interface PinnedReceipt {
  transactionHash: Hex;
  contract: "launchpad" | "router" | "feeController";
  expectedEvidence: unknown;
}

interface FinalizedFixture {
  schemaVersion: number;
  deploymentId: string;
  chainId: number;
  generation: string;
  abiRevision: string;
  pinnedAtBlock: string;
  transactions: Record<Hex, PinnedTransaction>;
  receipts: Record<
    "launchCreated" | "curveSelected" | "launchCreation" | "buy" | "sell" | "routerSwap" | "graduated" | "feesCollected",
    PinnedReceipt
  >;
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/robinhood-mainnet.json", import.meta.url), "utf8"),
) as FinalizedFixture;
const FINALITY_DEPTH = 5_000n;
const LONG_STRING_THRESHOLD = 256;
const deployment = getDeployment(ROBINHOOD_CHAIN_ID);

function transactionOf(pinned: PinnedReceipt): PinnedTransaction {
  const transaction = fixture.transactions[pinned.transactionHash];
  if (!transaction) throw new Error(`fixture is missing transaction ${pinned.transactionHash}`);
  return transaction;
}

function receiptLike(transaction: PinnedTransaction, hash: Hex, overrides: Partial<ReceiptLike> = {}): ReceiptLike {
  return {
    status: transaction.receipt.status,
    transactionHash: hash,
    logs: transaction.receipt.logs.map((log) => ({ ...log, address: getAddress(log.address) })),
    ...overrides,
  };
}

function contractAddress(pinned: PinnedReceipt): Address {
  return pinned.contract === "launchpad" ? deployment.contracts.launchpad
    : pinned.contract === "router" ? deployment.contracts.router
    : deployment.contracts.feeController;
}

/** Replaces every string over LONG_STRING_THRESHOLD chars with a length+hash digest. */
function digestLongStrings(value: unknown): unknown {
  if (typeof value === "string" && value.length > LONG_STRING_THRESHOLD) {
    return { length: value.length, sha256: createHash("sha256").update(value).digest("hex") };
  }
  if (Array.isArray(value)) return value.map(digestLongStrings);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, digestLongStrings(child)]));
  }
  return value;
}

function stringified(value: unknown): unknown {
  return digestLongStrings(
    JSON.parse(JSON.stringify(value, (_key, child) => (typeof child === "bigint" ? child.toString() : child))),
  );
}

function codeOf(action: () => unknown): string {
  try {
    action();
    return "no error";
  } catch (error) {
    if (!(error instanceof SdkError)) throw error;
    return error.code;
  }
}

describe("pinned finalized Robinhood Chain receipts", () => {
  it("were pinned against the deployment this SDK currently targets", () => {
    // A compatibility change (address, generation, or ABI revision) fails here until every
    // receipt is re-pinned against the new identity.
    expect(fixture.chainId).toBe(deployment.chainId);
    expect(fixture.generation).toBe(deployment.contracts.generation);
    expect(fixture.abiRevision).toBe(deployment.contracts.abiRevision);
  });

  it("covers every verify*Receipt function", () => {
    expect(Object.keys(fixture.receipts).sort()).toEqual(
      ["buy", "curveSelected", "feesCollected", "graduated", "launchCreated", "launchCreation", "routerSwap", "sell"].sort(),
    );
  });

  for (const [name, pinned] of Object.entries(fixture.receipts)) {
    it(`${name}: is finalized and classifies as matched with the recorded evidence`, () => {
      const transaction = transactionOf(pinned);
      expect(BigInt(transaction.blockNumber) + FINALITY_DEPTH).toBeLessThan(BigInt(fixture.pinnedAtBlock));
      expect(transaction.receipt.status).toBe("success");

      const address = contractAddress(pinned);
      const receipt = receiptLike(transaction, pinned.transactionHash);
      const result = name === "launchCreated" ? verifyLaunchCreatedReceipt(receipt, address)
        : name === "curveSelected" ? verifyCurveSelectedReceipt(receipt, address)
        : name === "launchCreation" ? verifyLaunchCreationReceipt(receipt, address)
        : name === "buy" ? verifyBuyReceipt(receipt, address)
        : name === "sell" ? verifySellReceipt(receipt, address)
        : name === "routerSwap" ? verifyRouterSwapReceipt(receipt, address)
        : name === "graduated" ? verifyGraduatedReceipt(receipt, address)
        : verifyFeesCollectedReceipt(receipt, address);

      expect(stringified(result)).toEqual(pinned.expectedEvidence);
    });

    it(`${name}: rejects a reverted status regardless of the pinned evidence`, () => {
      const transaction = transactionOf(pinned);
      const address = contractAddress(pinned);
      const receipt = receiptLike(transaction, pinned.transactionHash, { status: "reverted" });
      const run = () => {
        switch (name) {
          case "launchCreated": return verifyLaunchCreatedReceipt(receipt, address);
          case "curveSelected": return verifyCurveSelectedReceipt(receipt, address);
          case "launchCreation": return verifyLaunchCreationReceipt(receipt, address);
          case "buy": return verifyBuyReceipt(receipt, address);
          case "sell": return verifySellReceipt(receipt, address);
          case "routerSwap": return verifyRouterSwapReceipt(receipt, address);
          case "graduated": return verifyGraduatedReceipt(receipt, address);
          default: return verifyFeesCollectedReceipt(receipt, address);
        }
      };
      expect(codeOf(run)).toBe("RECEIPT_REVERTED");
    });
  }
});
