import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import { getAddress, pad, toHex, zeroAddress, type Address } from "viem";
import { SdkError } from "./errors.js";
import {
  BASIS_POINTS_DENOMINATOR,
  calculateCreatorCutCapacity,
  calculateSlippageFloor,
  validateDeadline,
  validateFeeRange,
  validateNativeValue,
} from "./economics.js";

// Bounds, round-trip, and monotonicity properties for every exported pure economic
// helper. See docs/SDK_STANDARDS.md "Invariant testing for capital-moving flows".

const HEGEL_SETTINGS = { testCases: 500, derandomize: true, database: hegel.Database.disabled } as const;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_AMOUNT = 10n ** 30n;
const nonNativeToken: Address = getAddress(pad(toHex(1n), { size: 20 }));

describe("Launch On Block economics properties", () => {
  it("keeps the slippage floor bounded, exact, and monotonic in the tolerance", () => {
    hegel.test((tc) => {
      const quotedAmountOut = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));
      const lowerBps = tc.draw(gs.integers({ minValue: 0, maxValue: BASIS_POINTS_DENOMINATOR }));
      const higherBps = tc.draw(gs.integers({ minValue: lowerBps, maxValue: BASIS_POINTS_DENOMINATOR }));

      const lowerFloor = calculateSlippageFloor(quotedAmountOut, lowerBps);
      const higherFloor = calculateSlippageFloor(quotedAmountOut, higherBps);

      expect(lowerFloor).toBe(quotedAmountOut * BigInt(BASIS_POINTS_DENOMINATOR - lowerBps) / BigInt(BASIS_POINTS_DENOMINATOR));
      expect(lowerFloor).toBeGreaterThanOrEqual(0n);
      expect(lowerFloor).toBeLessThanOrEqual(quotedAmountOut);
      expect(higherFloor).toBeLessThanOrEqual(lowerFloor);
    }, HEGEL_SETTINGS);
  });

  it("returns the full amount at zero slippage and zero at total slippage", () => {
    hegel.test((tc) => {
      const quotedAmountOut = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));

      expect(calculateSlippageFloor(quotedAmountOut, 0)).toBe(quotedAmountOut);
      expect(calculateSlippageFloor(quotedAmountOut, BASIS_POINTS_DENOMINATOR)).toBe(0n);
    }, HEGEL_SETTINGS);
  });

  it("derives creator capacity within bounds and rejects a protocol cut above the live ceiling", () => {
    hegel.test((tc) => {
      const protocolCutBps = tc.draw(gs.integers({ minValue: 0, maxValue: 65_535 }));
      const maxGraduationCutBps = tc.draw(gs.integers({ minValue: protocolCutBps, maxValue: 65_535 }));

      const capacity = calculateCreatorCutCapacity(maxGraduationCutBps, protocolCutBps);

      expect(capacity).toBe(maxGraduationCutBps - protocolCutBps);
      expect(capacity).toBeGreaterThanOrEqual(0);
      expect(capacity).toBeLessThanOrEqual(maxGraduationCutBps);
      if (protocolCutBps > 0) {
        expectCode(() => calculateCreatorCutCapacity(protocolCutBps - 1, protocolCutBps), "TERMS_INCONSISTENT");
      }
    }, HEGEL_SETTINGS);
  });

  it("validates a fee only against the supplied inclusive range and round-trips it unchanged", () => {
    hegel.test((tc) => {
      const minimumFeeBps = tc.draw(gs.integers({ minValue: 0, maxValue: 65_535 }));
      const maximumFeeBps = tc.draw(gs.integers({ minValue: minimumFeeBps, maxValue: 65_535 }));
      const feeBps = tc.draw(gs.integers({ minValue: minimumFeeBps, maxValue: maximumFeeBps }));

      expect(validateFeeRange(feeBps, minimumFeeBps, maximumFeeBps)).toBe(feeBps);
      if (minimumFeeBps > 0) {
        expectCode(() => validateFeeRange(minimumFeeBps - 1, minimumFeeBps, maximumFeeBps), "FEE_OUT_OF_RANGE");
      }
      if (maximumFeeBps < 65_535) {
        expectCode(() => validateFeeRange(maximumFeeBps + 1, minimumFeeBps, maximumFeeBps), "FEE_OUT_OF_RANGE");
      }
      if (maximumFeeBps > minimumFeeBps) {
        expectCode(() => validateFeeRange(feeBps, maximumFeeBps, minimumFeeBps), "TERMS_INCONSISTENT");
      }
    }, HEGEL_SETTINGS);
  });

  it("mirrors the Router deadline boundary using a supplied timestamp", () => {
    hegel.test((tc) => {
      const currentTimestamp = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));
      const deadline = tc.draw(gs.bigIntegers({ minValue: currentTimestamp, maxValue: currentTimestamp + MAX_AMOUNT }));

      expect(validateDeadline(deadline, currentTimestamp)).toBe(deadline);
      if (currentTimestamp > 0n) {
        expectCode(() => validateDeadline(currentTimestamp - 1n, currentTimestamp), "DEADLINE_EXPIRED");
      }
    }, HEGEL_SETTINGS);
  });

  it("derives the only valid native value for an exact-input swap and verifies a supplied one", () => {
    hegel.test((tc) => {
      const isNative = tc.draw(gs.booleans());
      const tokenIn = isNative ? zeroAddress : nonNativeToken;
      const amountIn = tc.draw(gs.bigIntegers({ minValue: 0n, maxValue: MAX_AMOUNT }));
      const expectedValue = isNative ? amountIn : 0n;

      expect(validateNativeValue(tokenIn, amountIn)).toBe(expectedValue);
      expect(validateNativeValue(tokenIn, amountIn, expectedValue)).toBe(expectedValue);
      const wrongValue = expectedValue + 1n;
      expectCode(() => validateNativeValue(tokenIn, amountIn, wrongValue), "NATIVE_VALUE_MISMATCH");
    }, HEGEL_SETTINGS);
  });

  it("rejects an out-of-range uint256 wherever one is accepted", () => {
    hegel.test((tc) => {
      const excess = tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_AMOUNT }));
      const overflow = MAX_UINT256 + excess;

      expectCode(() => calculateSlippageFloor(overflow, 0), "INVALID_ARGUMENT");
      expectCode(() => calculateSlippageFloor(-1n, 0), "INVALID_ARGUMENT");
      expectCode(() => validateDeadline(overflow, 0n), "INVALID_ARGUMENT");
      expectCode(() => validateNativeValue(nonNativeToken, overflow), "INVALID_ARGUMENT");
    }, HEGEL_SETTINGS);
  });
});

function expectCode(action: () => unknown, code: SdkError["code"]): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe(code);
  }
}
