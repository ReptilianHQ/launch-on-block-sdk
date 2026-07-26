import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  NATIVE_TOKEN_ADDRESS,
  buildSwapExactInTransaction,
  calculateCreatorCutCapacity,
  calculateSlippageFloor,
  validateDeadline,
  validateFeeRange,
  validateNativeValue,
} from "./index.js";

const router = getAddress("0x1111111111111111111111111111111111111111");
const token = getAddress("0x2222222222222222222222222222222222222222");
const recipient = getAddress("0x3333333333333333333333333333333333333333");

describe("pure economic helpers", () => {
  it("calculates the Solidity-style slippage floor without imposing product tolerance policy", () => {
    expect(calculateSlippageFloor(1_999n, 100)).toBe(1_979n);
    expect(calculateSlippageFloor(1_999n, 0)).toBe(1_999n);
    expect(calculateSlippageFloor(1_999n, 10_000)).toBe(0n);
    expect(() => calculateSlippageFloor(1n, 10_001)).toThrow(/slippageBps/i);
    expect(() => calculateSlippageFloor(-1n, 100)).toThrow(/quotedAmountOut/i);
  });

  it("derives creator capacity from supplied live terms and rejects inconsistent terms", () => {
    expect(calculateCreatorCutCapacity(500, 200)).toBe(300);
    expect(calculateCreatorCutCapacity(200, 200)).toBe(0);
    expect(() => calculateCreatorCutCapacity(199, 200)).toThrow(/protocolCutBps/i);
  });

  it("validates a fee only against the supplied inclusive range", () => {
    expect(validateFeeRange(50, 50, 500)).toBe(50);
    expect(validateFeeRange(500, 50, 500)).toBe(500);
    expect(() => validateFeeRange(49, 50, 500)).toThrow(/between 50 and 500/i);
    expect(() => validateFeeRange(100, 500, 50)).toThrow(/minimumFeeBps/i);
  });

  it("mirrors the Router deadline boundary using a supplied timestamp", () => {
    expect(validateDeadline(1_000n, 1_000n)).toBe(1_000n);
    expect(validateDeadline(1_001n, 1_000n)).toBe(1_001n);
    expect(() => validateDeadline(999n, 1_000n)).toThrow(/expired/i);
  });
});

describe("native value consistency", () => {
  it("derives native input value from amountIn", () => {
    expect(validateNativeValue(NATIVE_TOKEN_ADDRESS, 10n)).toBe(10n);
    const request = buildSwapExactInTransaction(router, {
      tokenIn: NATIVE_TOKEN_ADDRESS,
      tokenOut: token,
      amountIn: 10n,
      amountOutMin: 9n,
      recipient,
      deadline: 1_000n,
    });
    expect(request.value).toBe(10n);
  });

  it("rejects native input whose explicit value differs from amountIn", () => {
    expect(() => buildSwapExactInTransaction(router, {
      tokenIn: NATIVE_TOKEN_ADDRESS,
      tokenOut: token,
      amountIn: 10n,
      amountOutMin: 9n,
      recipient,
      deadline: 1_000n,
      value: 11n,
    })).toThrow(/value to equal amountIn/i);
  });

  it("requires zero value for ERC-20 input", () => {
    expect(buildSwapExactInTransaction(router, {
      tokenIn: token,
      tokenOut: NATIVE_TOKEN_ADDRESS,
      amountIn: 10n,
      amountOutMin: 9n,
      recipient,
      deadline: 1_000n,
    }).value).toBe(0n);
    expect(() => buildSwapExactInTransaction(router, {
      tokenIn: token,
      tokenOut: NATIVE_TOKEN_ADDRESS,
      amountIn: 10n,
      amountOutMin: 9n,
      recipient,
      deadline: 1_000n,
      value: 10n,
    })).toThrow(/zero native value/i);
  });
});
