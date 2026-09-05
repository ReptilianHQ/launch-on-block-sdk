import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { encodeAbiParameters, encodeEventTopics, getAddress, pad, toHex, type Address, type Hex } from "viem";
import { feeControllerAbi, launchpadAbi, routerAbi } from "./generated/abis.js";
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
  type ReceiptLog,
} from "./receipts.js";

// Every verify*Receipt function accepts matching evidence with equality, and — for the
// identity fields its `expected` parameter accepts — rejects a single perturbation of the
// receipt's evidence, classified by code. See docs/SDK_STANDARDS.md "Invariant testing for
// capital-moving flows".

// The scenario draw fans out over seven event shapes and the full 160-bit address space,
// so the very first generated case is legitimately large; suppressed per hegel's own guidance.
const HEGEL_SETTINGS = {
  testCases: 500,
  derandomize: true,
  database: hegel.Database.disabled,
  suppressHealthCheck: [hegel.HealthCheck.LargeInitialTestCase] as hegel.HealthCheck[],
} as const;
const MAX_AMOUNT = 10n ** 30n;
const MAX_ADDRESS = 2n ** 160n - 1n;
const FIXED_HASH = pad(toHex(1n), { size: 32 }) as Hex;

function drawAddress(tc: hegel.TestCase): Address {
  return getAddress(pad(toHex(tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_ADDRESS }))), { size: 20 }));
}

/** Draws an address distinct from every address in `taken`. */
function drawOther(tc: hegel.TestCase, ...taken: Address[]): Address {
  const lower = new Set(taken.map((address) => address.toLowerCase()));
  for (;;) {
    const candidate = drawAddress(tc);
    if (!lower.has(candidate.toLowerCase())) return candidate;
  }
}

function drawAmount(tc: hegel.TestCase, minValue = 0n, maxValue = MAX_AMOUNT): bigint {
  return tc.draw(gs.bigIntegers({ minValue, maxValue }));
}

function log(
  emitter: Address,
  abi: readonly unknown[],
  eventName: string,
  indexed: Record<string, unknown>,
  types: readonly { name: string; type: string }[],
  values: readonly unknown[],
): ReceiptLog {
  return {
    address: emitter,
    topics: encodeEventTopics({ abi, eventName, args: indexed } as never) as [Hex, ...Hex[]],
    data: encodeAbiParameters(types as never, values as never),
  };
}

function receipt(logs: readonly ReceiptLog[], overrides: Partial<ReceiptLike> = {}): ReceiptLike {
  return { status: "success", transactionHash: FIXED_HASH, logs, ...overrides };
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

/**
 * `checked` holds exactly the identity fields the verifier's `expected` parameter accepts;
 * only perturbing one of those is guaranteed to be caught, so `perturbations` is drawn from
 * the same key set.
 */
interface Scenario<TResult> {
  evidenceLog: ReceiptLog;
  expectedResult: TResult;
  checked: Record<string, unknown>;
  perturbations: Record<string, () => ReceiptLog>;
  run: (r: ReceiptLike, checked?: Record<string, unknown>) => TResult;
}

function launchCreatedScenario(tc: hegel.TestCase): Scenario<ReturnType<typeof verifyLaunchCreatedReceipt>> {
  const launchpad = drawAddress(tc);
  const token = drawAddress(tc);
  const creator = drawAddress(tc);
  const payoutWallet = drawAddress(tc);
  const creatorBps = tc.draw(gs.integers({ minValue: 0, maxValue: 65_535 }));
  const curveFeeBps = tc.draw(gs.integers({ minValue: 0, maxValue: 65_535 }));
  const metadataURI = `ipfs://${tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 }))}`;
  const build = (t: Address, c: Address, p: Address) =>
    log(launchpad, launchpadAbi, "LaunchCreated", { token: t, creator: c }, [
      { name: "creatorBps", type: "uint16" },
      { name: "curveFeeBps", type: "uint16" },
      { name: "payoutWallet", type: "address" },
      { name: "metadataURI", type: "string" },
    ], [creatorBps, curveFeeBps, p, metadataURI]);
  return {
    evidenceLog: build(token, creator, payoutWallet),
    expectedResult: { token, creator, creatorBps, curveFeeBps, payoutWallet, metadataURI },
    checked: { token, creator, payoutWallet },
    perturbations: {
      token: () => build(drawOther(tc, token), creator, payoutWallet),
      creator: () => build(token, drawOther(tc, creator), payoutWallet),
      payoutWallet: () => build(token, creator, drawOther(tc, payoutWallet)),
    },
    run: (r, checked = {}) => verifyLaunchCreatedReceipt(r, launchpad, checked as never),
  };
}

function curveSelectedScenario(tc: hegel.TestCase): Scenario<ReturnType<typeof verifyCurveSelectedReceipt>> {
  const launchpad = drawAddress(tc);
  const token = drawAddress(tc);
  const implementation = drawAddress(tc);
  const curveId = tc.draw(gs.integers({ minValue: 1, maxValue: 0xffff_ffff }));
  const quoteTarget = drawAmount(tc, 1n);
  const build = (t: Address, i: Address) =>
    log(launchpad, launchpadAbi, "CurveSelected", { token: t, curveId, implementation: i }, [
      { name: "quoteTarget", type: "uint256" },
    ], [quoteTarget]);
  return {
    evidenceLog: build(token, implementation),
    expectedResult: { token, curveId, implementation, quoteTarget },
    checked: { token, implementation },
    perturbations: {
      token: () => build(drawOther(tc, token), implementation),
      implementation: () => build(token, drawOther(tc, implementation)),
    },
    run: (r, checked = {}) => verifyCurveSelectedReceipt(r, launchpad, checked as never),
  };
}

function buyScenario(tc: hegel.TestCase): Scenario<ReturnType<typeof verifyBuyReceipt>> {
  const launchpad = drawAddress(tc);
  const token = drawAddress(tc);
  const buyer = drawAddress(tc);
  const amountIn = drawAmount(tc, 1n);
  const tokensOut = drawAmount(tc, 1n);
  const build = (t: Address, b: Address, inAmount: bigint) =>
    log(launchpad, launchpadAbi, "Buy", { token: t, buyer: b }, [
      { name: "amountIn", type: "uint256" },
      { name: "tokensOut", type: "uint256" },
    ], [inAmount, tokensOut]);
  return {
    evidenceLog: build(token, buyer, amountIn),
    expectedResult: { token, buyer, amountIn, tokensOut },
    checked: { token, buyer, amountIn },
    perturbations: {
      token: () => build(drawOther(tc, token), buyer, amountIn),
      buyer: () => build(token, drawOther(tc, buyer), amountIn),
      amountIn: () => build(token, buyer, amountIn + 1n),
    },
    run: (r, checked = {}) => verifyBuyReceipt(r, launchpad, checked as never),
  };
}

function sellScenario(tc: hegel.TestCase): Scenario<ReturnType<typeof verifySellReceipt>> {
  const launchpad = drawAddress(tc);
  const token = drawAddress(tc);
  const seller = drawAddress(tc);
  const tokensIn = drawAmount(tc, 1n);
  const amountOut = drawAmount(tc, 1n);
  const build = (t: Address, s: Address) =>
    log(launchpad, launchpadAbi, "Sell", { token: t, seller: s }, [
      { name: "tokensIn", type: "uint256" },
      { name: "amountOut", type: "uint256" },
    ], [tokensIn, amountOut]);
  return {
    evidenceLog: build(token, seller),
    expectedResult: { token, seller, tokensIn, amountOut },
    checked: { token, seller },
    perturbations: {
      token: () => build(drawOther(tc, token), seller),
      seller: () => build(token, drawOther(tc, seller)),
    },
    run: (r, checked = {}) => verifySellReceipt(r, launchpad, checked as never),
  };
}

function graduatedScenario(tc: hegel.TestCase): Scenario<ReturnType<typeof verifyGraduatedReceipt>> {
  const launchpad = drawAddress(tc);
  const token = drawAddress(tc);
  const pool = drawAddress(tc);
  const totalRaised = drawAmount(tc, 1n);
  const creatorCut = drawAmount(tc, 0n, totalRaised);
  const protocolCut = drawAmount(tc, 0n, totalRaised);
  const poolQuote = drawAmount(tc);
  const poolTokens = drawAmount(tc);
  const burnedTokens = drawAmount(tc);
  const build = (t: Address, p: Address) =>
    log(launchpad, launchpadAbi, "Graduated", { token: t, pool: p }, [
      { name: "totalRaised", type: "uint256" },
      { name: "creatorCut", type: "uint256" },
      { name: "protocolCut", type: "uint256" },
      { name: "poolQuote", type: "uint256" },
      { name: "poolTokens", type: "uint256" },
      { name: "burnedTokens", type: "uint256" },
    ], [totalRaised, creatorCut, protocolCut, poolQuote, poolTokens, burnedTokens]);
  return {
    evidenceLog: build(token, pool),
    expectedResult: { token, pool, totalRaised, creatorCut, protocolCut, poolQuote, poolTokens, burnedTokens },
    checked: { token, pool },
    perturbations: {
      token: () => build(drawOther(tc, token), pool),
      pool: () => build(token, drawOther(tc, pool)),
    },
    run: (r, checked = {}) => verifyGraduatedReceipt(r, launchpad, checked as never),
  };
}

function routerSwapScenario(tc: hegel.TestCase): Scenario<ReturnType<typeof verifyRouterSwapReceipt>> {
  const router = drawAddress(tc);
  const sender = drawAddress(tc);
  const pool = drawAddress(tc);
  const to = drawAddress(tc);
  const amountIn = drawAmount(tc, 1n);
  const amountOut = drawAmount(tc, 1n);
  const build = (s: Address, p: Address, t: Address) =>
    log(router, routerAbi, "Swap", { sender: s, pool: p, to: t }, [
      { name: "amountIn", type: "uint256" },
      { name: "amountOut", type: "uint256" },
    ], [amountIn, amountOut]);
  return {
    evidenceLog: build(sender, pool, to),
    expectedResult: { sender, pool, amountIn, amountOut, to },
    checked: { sender, pool, to },
    perturbations: {
      sender: () => build(drawOther(tc, sender), pool, to),
      pool: () => build(sender, drawOther(tc, pool), to),
      to: () => build(sender, pool, drawOther(tc, to)),
    },
    run: (r, checked = {}) => verifyRouterSwapReceipt(r, router, checked as never),
  };
}

function feesCollectedScenario(tc: hegel.TestCase): Scenario<ReturnType<typeof verifyFeesCollectedReceipt>> {
  const feeController = drawAddress(tc);
  const pair = drawAddress(tc);
  const caller = drawAddress(tc);
  const amount0 = drawAmount(tc);
  const amount1 = drawAmount(tc);
  const protocolAmount0 = drawAmount(tc);
  const protocolAmount1 = drawAmount(tc);
  const creatorAmount0 = drawAmount(tc);
  const creatorAmount1 = drawAmount(tc);
  const build = (p: Address, c: Address) =>
    log(feeController, feeControllerAbi, "FeesCollected", { pair: p, caller: c }, [
      { name: "amount0", type: "uint256" },
      { name: "amount1", type: "uint256" },
      { name: "protocolAmount0", type: "uint256" },
      { name: "protocolAmount1", type: "uint256" },
      { name: "creatorAmount0", type: "uint256" },
      { name: "creatorAmount1", type: "uint256" },
    ], [amount0, amount1, protocolAmount0, protocolAmount1, creatorAmount0, creatorAmount1]);
  return {
    evidenceLog: build(pair, caller),
    expectedResult: { pair, caller, amount0, amount1, protocolAmount0, protocolAmount1, creatorAmount0, creatorAmount1 },
    checked: { pair, caller },
    perturbations: {
      pair: () => build(drawOther(tc, pair), caller),
      caller: () => build(pair, drawOther(tc, caller)),
    },
    run: (r, checked = {}) => verifyFeesCollectedReceipt(r, feeController, checked as never),
  };
}

const SCENARIOS = {
  launchCreated: launchCreatedScenario,
  curveSelected: curveSelectedScenario,
  buy: buyScenario,
  sell: sellScenario,
  graduated: graduatedScenario,
  routerSwap: routerSwapScenario,
  feesCollected: feesCollectedScenario,
} as const;
type ScenarioName = keyof typeof SCENARIOS;
const SCENARIO_NAMES = Object.keys(SCENARIOS) as readonly ScenarioName[];

describe("Launch On Block receipt properties", () => {
  it("accepts matching evidence for every single-event verifier and returns it, ignoring unrelated logs", () => {
    hegel.test((tc) => {
      const name = tc.draw(gs.sampledFrom(SCENARIO_NAMES));
      const s = SCENARIOS[name](tc);
      const stranger = { ...s.evidenceLog, address: drawOther(tc, s.evidenceLog.address) };
      expect(s.run(receipt([stranger, s.evidenceLog]), s.checked)).toEqual(s.expectedResult);
    }, HEGEL_SETTINGS);
  });

  it("classifies a reverted receipt as RECEIPT_REVERTED regardless of log content", () => {
    hegel.test((tc) => {
      const name = tc.draw(gs.sampledFrom(SCENARIO_NAMES));
      const s = SCENARIOS[name](tc);
      const status = tc.draw(gs.sampledFrom(["reverted", 0, "0x0"] as const));
      expect(codeOf(() => s.run(receipt([s.evidenceLog], { status })))).toBe("RECEIPT_REVERTED");
    }, HEGEL_SETTINGS);
  });

  it("classifies a missing or wrong-emitter event as EVENT_NOT_FOUND", () => {
    hegel.test((tc) => {
      const name = tc.draw(gs.sampledFrom(SCENARIO_NAMES));
      const s = SCENARIOS[name](tc);
      const missing = tc.draw(gs.booleans());
      const logs = missing ? [] : [{ ...s.evidenceLog, address: drawOther(tc, s.evidenceLog.address) }];
      expect(codeOf(() => s.run(receipt(logs)))).toBe("EVENT_NOT_FOUND");
    }, HEGEL_SETTINGS);
  });

  it("classifies any single perturbation of a checked identity field as RECEIPT_FIELD_MISMATCH", () => {
    hegel.test((tc) => {
      const name = tc.draw(gs.sampledFrom(SCENARIO_NAMES));
      const s = SCENARIOS[name](tc);
      const fields = Object.keys(s.perturbations);
      const field = fields[tc.draw(gs.integers({ minValue: 0, maxValue: fields.length - 1 }))]!;
      const perturbed = s.perturbations[field]!();
      expect(codeOf(() => s.run(receipt([perturbed]), s.checked))).toBe("RECEIPT_FIELD_MISMATCH");
    }, HEGEL_SETTINGS);
  });

  it("passes a perturbed field silently when the caller supplies no expectation for it", () => {
    hegel.test((tc) => {
      const name = tc.draw(gs.sampledFrom(SCENARIO_NAMES));
      const s = SCENARIOS[name](tc);
      const fields = Object.keys(s.perturbations);
      const field = fields[tc.draw(gs.integers({ minValue: 0, maxValue: fields.length - 1 }))]!;
      const perturbed = s.perturbations[field]!();
      expect(() => s.run(receipt([perturbed]))).not.toThrow();
    }, HEGEL_SETTINGS);
  });

  it("enforces the Buy floor and lets Buy pass without one", () => {
    hegel.test((tc) => {
      const s = buyScenario(tc);
      expect(s.run(receipt([s.evidenceLog]))).toEqual(s.expectedResult);
      expect(
        codeOf(() => verifyBuyReceipt(receipt([s.evidenceLog]), s.evidenceLog.address, {
          minTokensOut: s.expectedResult.tokensOut + 1n,
        })),
      ).toBe("OUTPUT_BELOW_MINIMUM");
      expect(
        verifyBuyReceipt(receipt([s.evidenceLog]), s.evidenceLog.address, {
          minTokensOut: s.expectedResult.tokensOut,
        }),
      ).toEqual(s.expectedResult);
    }, HEGEL_SETTINGS);
  });

  it("requires LaunchCreated and CurveSelected to agree on the launch token", () => {
    hegel.test((tc) => {
      const launchpad = drawAddress(tc);
      const token = drawAddress(tc);
      const otherToken = drawOther(tc, token);
      const creator = drawAddress(tc);
      const payoutWallet = drawAddress(tc);
      const implementation = drawAddress(tc);
      const launchCreated = log(launchpad, launchpadAbi, "LaunchCreated", { token, creator }, [
        { name: "creatorBps", type: "uint16" },
        { name: "curveFeeBps", type: "uint16" },
        { name: "payoutWallet", type: "address" },
        { name: "metadataURI", type: "string" },
      ], [0, 0, payoutWallet, "ipfs://x"]);
      const curveSelected = (t: Address) =>
        log(launchpad, launchpadAbi, "CurveSelected", { token: t, curveId: 1, implementation }, [
          { name: "quoteTarget", type: "uint256" },
        ], [1n]);

      expect(() => verifyLaunchCreationReceipt(receipt([launchCreated, curveSelected(token)]), launchpad))
        .not.toThrow();
      expect(codeOf(() => verifyLaunchCreationReceipt(receipt([launchCreated, curveSelected(otherToken)]), launchpad)))
        .toBe("RECEIPT_FIELD_MISMATCH");
    }, HEGEL_SETTINGS);
  });
});
