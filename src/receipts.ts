import { decodeEventLog, type Abi, type Address, type Hex } from "viem";
import { feeControllerAbi, launchpadAbi, routerAbi } from "./generated/abis.js";
import { SdkError } from "./errors.js";

export interface ReceiptLog {
  address: Address;
  data: Hex;
  topics: readonly Hex[];
}

export interface ReceiptLike {
  status: "success" | "reverted" | 0 | 1 | "0x0" | "0x1";
  transactionHash?: Hex;
  logs: readonly ReceiptLog[];
}

export interface LaunchCreatedResult {
  token: Address;
  creator: Address;
  creatorBps: number;
  curveFeeBps: number;
  payoutWallet: Address;
  metadataURI: string;
}

export interface CurveSelectedResult {
  token: Address;
  curveId: number;
  implementation: Address;
  quoteTarget: bigint;
}

export interface LaunchCreationResult {
  launch: LaunchCreatedResult;
  curve: CurveSelectedResult;
}

export interface BuyResult {
  token: Address;
  buyer: Address;
  amountIn: bigint;
  tokensOut: bigint;
}

export interface SellResult {
  token: Address;
  seller: Address;
  tokensIn: bigint;
  amountOut: bigint;
}

export interface GraduatedResult {
  token: Address;
  pool: Address;
  totalRaised: bigint;
  creatorCut: bigint;
  protocolCut: bigint;
  poolQuote: bigint;
  poolTokens: bigint;
  burnedTokens: bigint;
}

export interface RouterSwapResult {
  sender: Address;
  pool: Address;
  amountIn: bigint;
  amountOut: bigint;
  to: Address;
}

export interface FeesCollectedResult {
  pair: Address;
  caller: Address;
  amount0: bigint;
  amount1: bigint;
  protocolAmount0: bigint;
  protocolAmount1: bigint;
  creatorAmount0: bigint;
  creatorAmount1: bigint;
}

export function assertSuccessfulReceipt(receipt: ReceiptLike): void {
  if (receipt.status !== "success" && receipt.status !== 1 && receipt.status !== "0x1") {
    const suffix = receipt.transactionHash ? ` ${receipt.transactionHash}` : "";
    throw new SdkError("RECEIPT_REVERTED", `Transaction${suffix} reverted`, {
      path: "status",
      expected: "success",
      actual: String(receipt.status),
    });
  }
}

export function verifyLaunchCreatedReceipt(
  receipt: ReceiptLike,
  launchpad: Address,
  expected: Partial<LaunchCreatedResult> = {},
): LaunchCreatedResult {
  const result = requireEvent<LaunchCreatedResult>(receipt, launchpad, launchpadAbi, "LaunchCreated");
  assertExpected(result, expected, new Set(["token", "creator", "payoutWallet"]));
  return result;
}

export function verifyCurveSelectedReceipt(
  receipt: ReceiptLike,
  launchpad: Address,
  expected: Partial<CurveSelectedResult> = {},
): CurveSelectedResult {
  const result = requireEvent<CurveSelectedResult>(receipt, launchpad, launchpadAbi, "CurveSelected");
  assertExpected(result, expected, new Set(["token", "implementation"]));
  return result;
}

/** Requires both creation events and proves that they describe the same launch token. */
export function verifyLaunchCreationReceipt(
  receipt: ReceiptLike,
  launchpad: Address,
  expected: {
    launch?: Partial<LaunchCreatedResult>;
    curve?: Partial<CurveSelectedResult>;
  } = {},
): LaunchCreationResult {
  const launch = verifyLaunchCreatedReceipt(receipt, launchpad, expected.launch);
  const curve = verifyCurveSelectedReceipt(receipt, launchpad, expected.curve);
  if (!sameAddress(launch.token, curve.token)) {
    throw new SdkError(
      "RECEIPT_FIELD_MISMATCH",
      `Creation events disagree on token: LaunchCreated emitted ${launch.token}, CurveSelected emitted ${curve.token}`,
      { path: "curve.token", expected: launch.token, actual: curve.token },
    );
  }
  return { launch, curve };
}

export function verifyBuyReceipt(
  receipt: ReceiptLike,
  launchpad: Address,
  expected: Partial<Pick<BuyResult, "token" | "buyer" | "amountIn">> & { minTokensOut?: bigint } = {},
): BuyResult {
  const result = requireEvent<BuyResult>(receipt, launchpad, launchpadAbi, "Buy");
  const { minTokensOut, ...exact } = expected;
  assertExpected(result, exact, new Set(["token", "buyer"]));
  if (minTokensOut !== undefined && result.tokensOut < minTokensOut) {
    throw new SdkError(
      "OUTPUT_BELOW_MINIMUM",
      `Receipt tokensOut is below the protected minimum: expected at least ${minTokensOut}, got ${result.tokensOut}`,
      { path: "tokensOut", expected: `>= ${minTokensOut}`, actual: String(result.tokensOut) },
    );
  }
  return result;
}

export function verifySellReceipt(
  receipt: ReceiptLike,
  launchpad: Address,
  expected: Partial<Pick<SellResult, "token" | "seller">> = {},
): SellResult {
  const result = requireEvent<SellResult>(receipt, launchpad, launchpadAbi, "Sell");
  assertExpected(result, expected, new Set(["token", "seller"]));
  return result;
}

export function verifyGraduatedReceipt(
  receipt: ReceiptLike,
  launchpad: Address,
  expected: Partial<Pick<GraduatedResult, "token" | "pool">> = {},
): GraduatedResult {
  const result = requireEvent<GraduatedResult>(receipt, launchpad, launchpadAbi, "Graduated");
  assertExpected(result, expected, new Set(["token", "pool"]));
  return result;
}

export function verifyRouterSwapReceipt(
  receipt: ReceiptLike,
  router: Address,
  expected: Partial<Pick<RouterSwapResult, "sender" | "pool" | "to">> = {},
): RouterSwapResult {
  const result = requireEvent<RouterSwapResult>(receipt, router, routerAbi, "Swap");
  assertExpected(result, expected, new Set(["sender", "pool", "to"]));
  return result;
}

export function verifyFeesCollectedReceipt(
  receipt: ReceiptLike,
  feeController: Address,
  expected: Partial<Pick<FeesCollectedResult, "pair" | "caller">> = {},
): FeesCollectedResult {
  const result = requireEvent<FeesCollectedResult>(receipt, feeController, feeControllerAbi, "FeesCollected");
  assertExpected(result, expected, new Set(["pair", "caller"]));
  return result;
}

function requireEvent<T>(
  receipt: ReceiptLike,
  emitter: Address,
  abi: Abi,
  eventName: string,
): T {
  assertSuccessfulReceipt(receipt);
  for (const log of receipt.logs) {
    if (!sameAddress(log.address, emitter)) continue;
    try {
      const decoded = decodeEventLog({
        abi,
        eventName,
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
        strict: true,
      });
      if (decoded.eventName !== eventName) continue;
      return decoded.args as T;
    } catch {
      // An expected emitter can produce several unrelated events in one receipt.
    }
  }
  const suffix = receipt.transactionHash ? ` in ${receipt.transactionHash}` : "";
  throw new SdkError("EVENT_NOT_FOUND", `Expected ${eventName} event from ${emitter}${suffix}`, {
    path: "logs",
    expected: `${eventName} from ${emitter}`,
    actual: "no matching log",
  });
}

function assertExpected<T extends object>(actual: T, expected: Partial<T>, addressFields: ReadonlySet<string>): void {
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actual[key as keyof T];
    const matches = addressFields.has(key) && typeof actualValue === "string" && typeof expectedValue === "string"
      ? sameAddress(actualValue as Address, expectedValue as Address)
      : actualValue === expectedValue;
    if (!matches) {
      throw new SdkError(
        "RECEIPT_FIELD_MISMATCH",
        `Receipt ${key} mismatch: expected ${String(expectedValue)}, got ${String(actualValue)}`,
        { path: key, expected: String(expectedValue), actual: String(actualValue) },
      );
    }
  }
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase();
}
