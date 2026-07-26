import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { feeControllerAbi, launchpadAbi, launchTokenAbi, routerAbi } from "./generated/abis.js";
import { SdkError } from "./errors.js";
import { validateNativeValue } from "./economics.js";

export interface TransactionRequest {
  to: Address;
  data: Hex;
  value: bigint;
}

/** JSON-RPC wallet shape used by `eth_sendTransaction`. */
export interface RpcTransactionRequest {
  to: Address;
  data: Hex;
  value: Hex;
  gas: Hex;
}

/** Transaction fields required to prove that a mined transaction matches reviewed calldata. */
export interface ConfirmedTransactionLike {
  from: Address;
  to: Address | null;
  value: bigint;
  input: Hex;
}

export interface CreateLaunchParameters {
  name: string;
  symbol: string;
  creatorBps: number;
  curveFeeBps: number;
  payoutWallet: Address;
  metadataUri: string;
  /** Omit to use the on-chain DEFAULT_CURVE_ID. */
  curveId?: number;
  salt?: Hex;
}

export function buildCreateLaunchTransaction(
  launchpad: Address,
  parameters: CreateLaunchParameters,
): TransactionRequest {
  assertAddress(launchpad, "launchpad");
  assertAddress(parameters.payoutWallet, "payoutWallet");
  assertUint16(parameters.creatorBps, "creatorBps");
  assertUint16(parameters.curveFeeBps, "curveFeeBps");
  if (parameters.curveId !== undefined) assertCurveId(parameters.curveId);
  const commonArgs = [
    parameters.name,
    parameters.symbol,
    parameters.creatorBps,
    parameters.curveFeeBps,
    parameters.payoutWallet,
    parameters.metadataUri,
  ] as const;
  if (parameters.salt !== undefined) {
    assertBytes32(parameters.salt, "salt");
    if (BigInt(parameters.salt) === 0n) {
      throw new SdkError("INVALID_ARGUMENT", "salt must not be zero", {
        path: "salt",
        expected: "nonzero bytes32",
        actual: parameters.salt,
      });
    }
    if (parameters.curveId !== undefined) {
      return {
        to: launchpad,
        data: encodeFunctionData({
          abi: launchpadAbi,
          functionName: "createLaunchVanity",
          args: [...commonArgs, parameters.salt, parameters.curveId],
        }),
        value: 0n,
      };
    }
    return {
      to: launchpad,
      data: encodeFunctionData({
        abi: launchpadAbi,
        functionName: "createLaunchVanity",
        args: [...commonArgs, parameters.salt],
      }),
      value: 0n,
    };
  }
  if (parameters.curveId !== undefined) {
    return {
      to: launchpad,
      data: encodeFunctionData({
        abi: launchpadAbi,
        functionName: "createLaunch",
        args: [...commonArgs, parameters.curveId],
      }),
      value: 0n,
    };
  }
  return {
    to: launchpad,
    data: encodeFunctionData({ abi: launchpadAbi, functionName: "createLaunch", args: commonArgs }),
    value: 0n,
  };
}

export function buildCurveBuyTransaction(
  launchpad: Address,
  parameters: { token: Address; minTokensOut: bigint; value: bigint },
): TransactionRequest {
  assertAddress(launchpad, "launchpad");
  assertAddress(parameters.token, "token");
  assertUint256(parameters.minTokensOut, "minTokensOut");
  assertPositive(parameters.value, "value");
  return {
    to: launchpad,
    data: encodeFunctionData({
      abi: launchpadAbi,
      functionName: "buy",
      args: [parameters.token, parameters.minTokensOut],
    }),
    value: parameters.value,
  };
}

export function buildCurveSellTransaction(
  launchpad: Address,
  parameters: { token: Address; tokensIn: bigint; minAmountOut: bigint },
): TransactionRequest {
  assertAddress(launchpad, "launchpad");
  assertAddress(parameters.token, "token");
  assertUint256(parameters.minAmountOut, "minAmountOut");
  assertPositive(parameters.tokensIn, "tokensIn");
  return {
    to: launchpad,
    data: encodeFunctionData({
      abi: launchpadAbi,
      functionName: "sell",
      args: [parameters.token, parameters.tokensIn, parameters.minAmountOut],
    }),
    value: 0n,
  };
}

export function buildGraduateTransaction(launchpad: Address, token: Address): TransactionRequest {
  assertAddress(launchpad, "launchpad");
  assertAddress(token, "token");
  return {
    to: launchpad,
    data: encodeFunctionData({ abi: launchpadAbi, functionName: "graduate", args: [token] }),
    value: 0n,
  };
}

export function buildClaimTransaction(launchpad: Address, token?: Address): TransactionRequest {
  assertAddress(launchpad, "launchpad");
  if (token !== undefined) assertAddress(token, "token");
  return token === undefined
    ? { to: launchpad, data: encodeFunctionData({ abi: launchpadAbi, functionName: "claim" }), value: 0n }
    : { to: launchpad, data: encodeFunctionData({ abi: launchpadAbi, functionName: "claimAll", args: [token] }), value: 0n };
}

export function buildApproveTransaction(token: Address, spender: Address, amount: bigint): TransactionRequest {
  assertAddress(token, "token");
  assertAddress(spender, "spender");
  assertUint256(amount, "amount");
  return {
    to: token,
    data: encodeFunctionData({ abi: launchTokenAbi, functionName: "approve", args: [spender, amount] }),
    value: 0n,
  };
}

export function buildRouterBuyTransaction(
  router: Address,
  parameters: { token: Address; minTokensOut: bigint; deadline: bigint; value: bigint },
): TransactionRequest {
  assertAddress(router, "router");
  assertAddress(parameters.token, "token");
  assertUint256(parameters.minTokensOut, "minTokensOut");
  assertUint256(parameters.deadline, "deadline");
  assertPositive(parameters.value, "value");
  return {
    to: router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "buy",
      args: [parameters.token, parameters.minTokensOut, parameters.deadline],
    }),
    value: parameters.value,
  };
}

export function buildRouterSellTransaction(
  router: Address,
  parameters: { token: Address; tokensIn: bigint; minAmountOut: bigint; deadline: bigint },
): TransactionRequest {
  assertAddress(router, "router");
  assertAddress(parameters.token, "token");
  assertUint256(parameters.minAmountOut, "minAmountOut");
  assertUint256(parameters.deadline, "deadline");
  assertPositive(parameters.tokensIn, "tokensIn");
  return {
    to: router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "sell",
      args: [parameters.token, parameters.tokensIn, parameters.minAmountOut, parameters.deadline],
    }),
    value: 0n,
  };
}

export function buildSwapExactInTransaction(
  router: Address,
  parameters: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMin: bigint;
    recipient: Address;
    deadline: bigint;
    value?: bigint;
  },
): TransactionRequest {
  assertAddress(router, "router");
  assertAddress(parameters.tokenIn, "tokenIn");
  assertAddress(parameters.tokenOut, "tokenOut");
  assertAddress(parameters.recipient, "recipient");
  if (parameters.recipient.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    throw new SdkError("INVALID_ADDRESS", "recipient must not be the zero address", {
      path: "recipient",
      expected: "nonzero EVM address",
      actual: parameters.recipient,
    });
  }
  assertUint256(parameters.amountOutMin, "amountOutMin");
  assertUint256(parameters.deadline, "deadline");
  assertPositive(parameters.amountIn, "amountIn");
  const value = validateNativeValue(parameters.tokenIn, parameters.amountIn, parameters.value);
  return {
    to: router,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "swapExactIn",
      args: [
        parameters.tokenIn,
        parameters.tokenOut,
        parameters.amountIn,
        parameters.amountOutMin,
        parameters.recipient,
        parameters.deadline,
      ],
    }),
    value,
  };
}

export function buildCollectFeesTransaction(
  feeController: Address,
  pair: Address,
  venue: "amm" | "lb",
): TransactionRequest {
  assertAddress(feeController, "feeController");
  assertAddress(pair, "pair");
  return {
    to: feeController,
    data: encodeFunctionData({
      abi: feeControllerAbi,
      functionName: venue === "amm" ? "collectFees" : "collectLBFees",
      args: [pair],
    }),
    value: 0n,
  };
}

export function toRpcTransactionRequest(request: TransactionRequest, gas: bigint): RpcTransactionRequest {
  assertPositive(gas, "gas");
  return {
    to: request.to,
    data: request.data,
    value: toHex(request.value),
    gas: toHex(gas),
  };
}

export function parseRpcTransactionRequest(value: {
  to: string;
  data: string;
  value: string;
  gas: string;
}): RpcTransactionRequest {
  if (!isAddress(value.to)) {
    throw new SdkError("INVALID_ADDRESS", "Transaction target must be an EVM address", {
      path: "to",
      expected: "20-byte EVM address",
      actual: value.to,
    });
  }
  if (!isHex(value.data) || value.data.length % 2 !== 0) {
    throw new SdkError("INVALID_CALLDATA", "Transaction calldata must be byte-aligned hex", {
      path: "data",
      expected: "byte-aligned hex",
      actual: value.data,
    });
  }
  if (!isQuantity(value.value)) throw invalidQuantity("value", value.value);
  if (!isQuantity(value.gas)) throw invalidQuantity("gas", value.gas);
  return { to: getAddress(value.to), data: value.data, value: value.value, gas: value.gas };
}

export function verifyCreateLaunchTransaction(
  transaction: ConfirmedTransactionLike,
  launchpad: Address,
  account: Address,
  parameters: CreateLaunchParameters,
): DecodedLaunchpadTransaction {
  const expected = buildCreateLaunchTransaction(launchpad, parameters);
  assertTransactionMatches(transaction, account, expected, "Launchpad create");
  return decodeLaunchpadTransaction(transaction.input);
}

export function verifyCurveBuyTransaction(
  transaction: ConfirmedTransactionLike,
  launchpad: Address,
  account: Address,
  parameters: { token: Address; minTokensOut: bigint; value: bigint },
): DecodedLaunchpadTransaction {
  const expected = buildCurveBuyTransaction(launchpad, parameters);
  assertTransactionMatches(transaction, account, expected, "Launchpad buy");
  return decodeLaunchpadTransaction(transaction.input);
}

export type DecodedLaunchpadTransaction =
  | {
    functionName: "createLaunch";
    args: readonly [string, string, number, number, Address, string]
      | readonly [string, string, number, number, Address, string, number];
  }
  | {
    functionName: "createLaunchVanity";
    args: readonly [string, string, number, number, Address, string, Hex]
      | readonly [string, string, number, number, Address, string, Hex, number];
  }
  | { functionName: "buy"; args: readonly [Address, bigint] }
  | { functionName: "sell"; args: readonly [Address, bigint, bigint] }
  | { functionName: "graduate"; args: readonly [Address] }
  | { functionName: "claim"; args: readonly [] }
  | { functionName: "claimAll"; args: readonly [Address] };

export function decodeLaunchpadTransaction(data: Hex): DecodedLaunchpadTransaction {
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: launchpadAbi, data });
  } catch (cause) {
    throw new SdkError("INVALID_CALLDATA", "Calldata is not recognized by the Launchpad ABI", {
      path: "data",
      actual: data,
      cause,
    });
  }
  switch (decoded.functionName) {
    case "createLaunch":
      return { functionName: decoded.functionName, args: decoded.args };
    case "createLaunchVanity":
      return { functionName: decoded.functionName, args: decoded.args };
    case "buy":
      return { functionName: decoded.functionName, args: decoded.args };
    case "sell":
      return { functionName: decoded.functionName, args: decoded.args };
    case "graduate":
      return { functionName: decoded.functionName, args: decoded.args };
    case "claim":
      return { functionName: decoded.functionName, args: [] };
    case "claimAll":
      return { functionName: decoded.functionName, args: decoded.args };
    default:
      throw new SdkError(
        "UNSUPPORTED_FUNCTION",
        `Unsupported Launchpad transaction function: ${decoded.functionName}`,
        { path: "functionName", actual: decoded.functionName },
      );
  }
}

export type DecodedRouterTransaction =
  | { functionName: "buy"; args: readonly [Address, bigint, bigint] }
  | { functionName: "sell"; args: readonly [Address, bigint, bigint, bigint] }
  | { functionName: "swapExactIn"; args: readonly [Address, Address, bigint, bigint, Address, bigint] };

export function decodeRouterTransaction(data: Hex): DecodedRouterTransaction {
  let decoded;
  try {
    decoded = decodeFunctionData({ abi: routerAbi, data });
  } catch (cause) {
    throw new SdkError("INVALID_CALLDATA", "Calldata is not recognized by the Router ABI", {
      path: "data",
      actual: data,
      cause,
    });
  }
  switch (decoded.functionName) {
    case "buy":
      return { functionName: decoded.functionName, args: decoded.args };
    case "sell":
      return { functionName: decoded.functionName, args: decoded.args };
    case "swapExactIn":
      return { functionName: decoded.functionName, args: decoded.args };
    default:
      throw new SdkError(
        "UNSUPPORTED_FUNCTION",
        `Unsupported Router transaction function: ${decoded.functionName}`,
        { path: "functionName", actual: decoded.functionName },
      );
  }
}

function assertPositive(value: bigint, name: string): void {
  assertUint256(value, name);
  if (value <= 0n) {
    throw new SdkError("INVALID_ARGUMENT", `${name} must be greater than zero`, {
      path: name,
      expected: "> 0",
      actual: String(value),
    });
  }
}

function assertAddress(value: string, name: string): asserts value is Address {
  if (!isAddress(value)) {
    throw new SdkError("INVALID_ADDRESS", `${name} must be an EVM address`, {
      path: name,
      expected: "20-byte EVM address",
      actual: value,
    });
  }
}

function assertUint256(value: bigint, name: string): void {
  const maxUint256 = (1n << 256n) - 1n;
  if (value < 0n || value > maxUint256) {
    throw new SdkError("INVALID_ARGUMENT", `${name} must be an unsigned 256-bit integer`, {
      path: name,
      expected: "unsigned 256-bit integer",
      actual: String(value),
    });
  }
}

function assertUint16(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) {
    throw new SdkError("INVALID_ARGUMENT", `${name} must be an unsigned 16-bit integer`, {
      path: name,
      expected: "integer from 0 through 65535",
      actual: String(value),
    });
  }
}

function assertCurveId(value: number): void {
  if (!Number.isInteger(value) || value <= 0 || value > 0xffff_ffff) {
    throw new SdkError("INVALID_ARGUMENT", "curveId must be a nonzero unsigned 32-bit integer", {
      path: "curveId",
      expected: "integer from 1 through 4294967295",
      actual: String(value),
    });
  }
}

function assertBytes32(value: Hex, name: string): void {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new SdkError("INVALID_ARGUMENT", `${name} must be exactly 32 bytes`, {
      path: name,
      expected: "32-byte hex",
      actual: value,
    });
  }
}

function assertTransactionMatches(
  transaction: ConfirmedTransactionLike,
  account: Address,
  expected: TransactionRequest,
  label: string,
): void {
  if (!sameAddress(transaction.from, account)) {
    throw new SdkError("UNEXPECTED_SENDER", `${label} sender does not match the authorized account`, {
      path: "from",
      expected: account,
      actual: transaction.from,
    });
  }
  if (transaction.to === null || !sameAddress(transaction.to, expected.to)) {
    throw new SdkError("UNEXPECTED_TARGET", `${label} target does not match`, {
      path: "to",
      expected: expected.to,
      actual: transaction.to ?? "null",
    });
  }
  if (transaction.value !== expected.value) {
    throw new SdkError("UNEXPECTED_VALUE", `${label} value does not match`, {
      path: "value",
      expected: String(expected.value),
      actual: String(transaction.value),
    });
  }
  if (transaction.input.toLowerCase() !== expected.data.toLowerCase()) {
    throw new SdkError("CALLDATA_MISMATCH", `${label} calldata does not match`, {
      path: "input",
      expected: expected.data,
      actual: transaction.input,
    });
  }
}

function invalidQuantity(path: "value" | "gas", actual: string): SdkError {
  return new SdkError("INVALID_RPC_QUANTITY", `Transaction ${path} must be a JSON-RPC quantity`, {
    path,
    expected: "canonical JSON-RPC hex quantity",
    actual,
  });
}

function isQuantity(value: string): value is Hex {
  return /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value);
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
