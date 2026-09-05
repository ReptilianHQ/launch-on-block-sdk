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

interface PinnedReceipt {
  contract: "launchpad" | "router" | "feeController";
  blockNumber: string;
  transactionHash: Hex;
  explorerUrl: string;
  receipt: { status: "reverted" | "success"; logs: Array<{ address: Address; topics: Hex[]; data: Hex }> };
  expectedEvidence: unknown;
}

interface FinalizedFixture {
  schemaVersion: number;
  deploymentId: string;
  chainId: number;
  generation: string;
  abiRevision: string;
  pinnedAtBlock: string;
  receipts: Record<
    "launchCreated" | "curveSelected" | "launchCreation" | "buy" | "sell" | "routerSwap" | "graduated" | "feesCollected",
    PinnedReceipt
  >;
}

const fixture = JSON.parse(
  readFileSync(new URL("../fixtures/robinhood-mainnet.json", import.meta.url), "utf8"),
) as FinalizedFixture;
const FINALITY_DEPTH = 5_000n;
const deployment = getDeployment(ROBINHOOD_CHAIN_ID);

function receiptLike(pinned: PinnedReceipt, overrides: Partial<ReceiptLike> = {}): ReceiptLike {
  return {
    status: pinned.receipt.status,
    transactionHash: pinned.transactionHash,
    logs: pinned.receipt.logs.map((log) => ({ ...log, address: getAddress(log.address) })),
    ...overrides,
  };
}

function contractAddress(pinned: PinnedReceipt): Address {
  return pinned.contract === "launchpad" ? deployment.contracts.launchpad
    : pinned.contract === "router" ? deployment.contracts.router
    : deployment.contracts.feeController;
}

function stringified(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_key, child) => (typeof child === "bigint" ? child.toString() : child)));
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
      expect(BigInt(pinned.blockNumber) + FINALITY_DEPTH).toBeLessThan(BigInt(fixture.pinnedAtBlock));
      expect(pinned.receipt.status).toBe("success");

      const address = contractAddress(pinned);
      const receipt = receiptLike(pinned);
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
      const address = contractAddress(pinned);
      const receipt = receiptLike(pinned, { status: "reverted" });
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
