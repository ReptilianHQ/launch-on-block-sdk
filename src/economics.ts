import { isAddress, zeroAddress, type Address } from "viem";
import { SdkError } from "./errors.js";

export const BASIS_POINTS_DENOMINATOR = 10_000;
export const NATIVE_TOKEN_ADDRESS: Address = zeroAddress;

const MAX_UINT16 = 65_535;
const MAX_UINT256 = (1n << 256n) - 1n;

/**
 * Applies a caller-selected slippage tolerance and rounds down exactly as Solidity does.
 * Product-specific tolerance limits belong to the caller; this helper accepts the full bps range.
 */
export function calculateSlippageFloor(quotedAmountOut: bigint, slippageBps: number): bigint {
  assertUint256(quotedAmountOut, "quotedAmountOut");
  assertBasisPoints(slippageBps, "slippageBps");
  return quotedAmountOut * BigInt(BASIS_POINTS_DENOMINATOR - slippageBps)
    / BigInt(BASIS_POINTS_DENOMINATOR);
}

/** Calculates the largest creator graduation cut allowed by caller-supplied live terms. */
export function calculateCreatorCutCapacity(
  maxGraduationCutBps: number,
  protocolCutBps: number,
): number {
  assertUint16(maxGraduationCutBps, "maxGraduationCutBps");
  assertUint16(protocolCutBps, "protocolCutBps");
  if (protocolCutBps > maxGraduationCutBps) {
    throw new SdkError("TERMS_INCONSISTENT", "protocolCutBps cannot exceed maxGraduationCutBps", {
      path: "protocolCutBps",
      expected: `<= ${maxGraduationCutBps}`,
      actual: String(protocolCutBps),
    });
  }
  return maxGraduationCutBps - protocolCutBps;
}

/** Validates a fee against caller-supplied live bounds and returns the validated value. */
export function validateFeeRange(
  feeBps: number,
  minimumFeeBps: number,
  maximumFeeBps: number,
): number {
  assertUint16(feeBps, "feeBps");
  assertUint16(minimumFeeBps, "minimumFeeBps");
  assertUint16(maximumFeeBps, "maximumFeeBps");
  if (minimumFeeBps > maximumFeeBps) {
    throw new SdkError("TERMS_INCONSISTENT", "minimumFeeBps cannot exceed maximumFeeBps", {
      path: "minimumFeeBps",
      expected: `<= ${maximumFeeBps}`,
      actual: String(minimumFeeBps),
    });
  }
  if (feeBps < minimumFeeBps || feeBps > maximumFeeBps) {
    throw new SdkError("FEE_OUT_OF_RANGE", `feeBps must be between ${minimumFeeBps} and ${maximumFeeBps}`, {
      path: "feeBps",
      expected: `${minimumFeeBps}..${maximumFeeBps}`,
      actual: String(feeBps),
    });
  }
  return feeBps;
}

/**
 * Validates the Router's exact expiry rule against a caller-supplied timestamp.
 * A deadline equal to the current timestamp remains valid on-chain.
 */
export function validateDeadline(deadline: bigint, currentTimestamp: bigint): bigint {
  assertUint256(deadline, "deadline");
  assertUint256(currentTimestamp, "currentTimestamp");
  if (deadline < currentTimestamp) {
    throw new SdkError("DEADLINE_EXPIRED", "deadline has expired", {
      path: "deadline",
      expected: `>= ${currentTimestamp}`,
      actual: String(deadline),
    });
  }
  return deadline;
}

/**
 * Derives the only valid transaction value for an exact-input swap and, when supplied,
 * verifies that a caller-provided value agrees with both tokenIn and amountIn.
 */
export function validateNativeValue(
  tokenIn: Address,
  amountIn: bigint,
  value?: bigint,
): bigint {
  if (!isAddress(tokenIn)) {
    throw new SdkError("INVALID_ADDRESS", "tokenIn must be an EVM address", {
      path: "tokenIn",
      expected: "20-byte EVM address",
      actual: tokenIn,
    });
  }
  assertUint256(amountIn, "amountIn");
  if (value !== undefined) assertUint256(value, "value");

  const expectedValue = tokenIn.toLowerCase() === NATIVE_TOKEN_ADDRESS ? amountIn : 0n;
  if (value !== undefined && value !== expectedValue) {
    throw new SdkError(
      "NATIVE_VALUE_MISMATCH",
      tokenIn.toLowerCase() === NATIVE_TOKEN_ADDRESS
        ? "Native input requires value to equal amountIn"
        : "ERC-20 input requires zero native value",
      { path: "value", expected: String(expectedValue), actual: String(value) },
    );
  }
  return expectedValue;
}

function assertBasisPoints(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > BASIS_POINTS_DENOMINATOR) {
    throw invalidArgument(name, `integer from 0 through ${BASIS_POINTS_DENOMINATOR}`, value);
  }
}

function assertUint16(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT16) {
    throw invalidArgument(name, "integer from 0 through 65535", value);
  }
}

function assertUint256(value: bigint, name: string): void {
  if (value < 0n || value > MAX_UINT256) throw invalidArgument(name, "unsigned 256-bit integer", value);
}

function invalidArgument(name: string, expected: string, actual: number | bigint): SdkError {
  return new SdkError("INVALID_ARGUMENT", `${name} must be an ${expected}`, {
    path: name,
    expected,
    actual: String(actual),
  });
}
