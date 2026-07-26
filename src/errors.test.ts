import { describe, expect, it } from "vitest";
import { encodeFunctionData, getAddress } from "viem";
import {
  SdkError,
  assertSuccessfulReceipt,
  buildCreateLaunchTransaction,
  decodeLaunchpadTransaction,
  getChain,
  isSdkError,
  launchpadAbi,
  parseRpcTransactionRequest,
  validateDeadline,
  verifyCreateLaunchTransaction,
} from "./index.js";

const launchpad = getAddress("0xD89D79a025Cd99a1E2D3712397D128B5182fBc5d");
const account = getAddress("0x0000000000000000000000000000000000000001");

function capture(run: () => unknown): SdkError {
  try {
    run();
  } catch (error) {
    expect(isSdkError(error)).toBe(true);
    return error as SdkError;
  }
  throw new Error("expected SDK operation to throw");
}

describe("stable SDK errors", () => {
  it("classifies request parsing and authorization failures without message parsing", () => {
    expect(capture(() => parseRpcTransactionRequest({
      to: "not-an-address",
      data: "0x00",
      value: "0x0",
      gas: "0x1",
    })).toJSON()).toMatchObject({ code: "INVALID_ADDRESS", path: "to" });

    const parameters = {
      name: "Gecko",
      symbol: "GECKO",
      creatorBps: 0,
      curveFeeBps: 100,
      payoutWallet: account,
      metadataUri: "",
    } as const;
    const request = buildCreateLaunchTransaction(launchpad, parameters);
    expect(capture(() => verifyCreateLaunchTransaction({
      from: account,
      to: launchpad,
      value: 1n,
      input: request.data,
    }, launchpad, account, parameters))).toMatchObject({
      code: "UNEXPECTED_VALUE",
      path: "value",
      expected: "0",
      actual: "1",
    });
  });

  it("classifies unsupported functions, receipts, economics, and deployment lookup", () => {
    const quote = encodeFunctionData({ abi: launchpadAbi, functionName: "quoteBuy", args: [account, 1n] });
    expect(capture(() => decodeLaunchpadTransaction(quote))).toMatchObject({
      code: "UNSUPPORTED_FUNCTION",
      actual: "quoteBuy",
    });
    expect(capture(() => assertSuccessfulReceipt({ status: "reverted", logs: [] }))).toMatchObject({
      code: "RECEIPT_REVERTED",
      path: "status",
    });
    expect(capture(() => validateDeadline(9n, 10n))).toMatchObject({
      code: "DEADLINE_EXPIRED",
      path: "deadline",
    });
    expect(capture(() => getChain(999_999))).toMatchObject({
      code: "UNSUPPORTED_CHAIN",
      path: "chainId",
    });
  });
});
