import { describe, expect, it } from "vitest";
import * as hegel from "@hegeldev/hegel";
import * as gs from "@hegeldev/hegel/generators";
import {
  bytesToHex,
  decodeFunctionData,
  getAddress,
  hexToBytes,
  pad,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { feeControllerAbi, launchTokenAbi } from "./generated/abis.js";
import { SdkError } from "./errors.js";
import {
  buildApproveTransaction,
  buildClaimTransaction,
  buildCollectFeesTransaction,
  buildCreateLaunchTransaction,
  buildCurveBuyTransaction,
  buildCurveSellTransaction,
  buildGraduateTransaction,
  buildRouterBuyTransaction,
  buildRouterSellTransaction,
  buildSwapExactInTransaction,
  decodeLaunchpadTransaction,
  decodeRouterTransaction,
  verifyApproveTransaction,
  verifyClaimTransaction,
  verifyCollectFeesTransaction,
  verifyCreateLaunchTransaction,
  verifyCurveBuyTransaction,
  verifyCurveSellTransaction,
  verifyGraduateTransaction,
  verifyRouterBuyTransaction,
  verifyRouterSellTransaction,
  verifySwapExactInTransaction,
  type ConfirmedTransactionLike,
  type CreateLaunchParameters,
  type TransactionRequest,
} from "./transactions.js";

// Layer 1 construction round trips: every exported build* function decodes back through
// the pinned ABI to the drawn intent, and any single-byte perturbation of its calldata is
// classified CALLDATA_MISMATCH by the matching verify* function. See docs/SDK_STANDARDS.md.

const HEGEL_SETTINGS = { testCases: 500, derandomize: true, database: hegel.Database.disabled } as const;
const MAX_AMOUNT = 10n ** 30n;
const MAX_ADDRESS = 2n ** 160n - 1n;

const launchpad = fixedAddress(1n);
const router = fixedAddress(2n);
const feeController = fixedAddress(3n);
const account = fixedAddress(4n);

function fixedAddress(n: bigint): Address {
  return getAddress(pad(toHex(n), { size: 20 }));
}

function drawAddress(tc: hegel.TestCase): Address {
  return getAddress(pad(toHex(tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: MAX_ADDRESS }))), { size: 20 }));
}

function drawAmount(tc: hegel.TestCase, minValue = 1n, maxValue = MAX_AMOUNT): bigint {
  return tc.draw(gs.bigIntegers({ minValue, maxValue }));
}

/** Flips one drawn byte anywhere in the calldata, selector included. */
function perturb(tc: hegel.TestCase, data: Hex): Hex {
  const bytes = hexToBytes(data);
  const at = tc.draw(gs.integers({ minValue: 0, maxValue: bytes.length - 1 }));
  bytes[at] = bytes[at]! ^ tc.draw(gs.integers({ minValue: 1, maxValue: 255 }));
  return bytesToHex(bytes);
}

function confirmedFrom(request: TransactionRequest, from: Address, data = request.data): ConfirmedTransactionLike {
  return { from, to: request.to, value: request.value, input: data };
}

function expectCode(action: () => unknown, code: SdkError["code"]): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe(code);
  }
}

describe("Launch On Block transaction construction properties", () => {
  it("round-trips createLaunch across curveId/vanity variants and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const name = `Token-${tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 }))}`;
      const symbol = `SYM${tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 }))}`;
      const creatorBps = tc.draw(gs.integers({ minValue: 0, maxValue: 65_535 }));
      const curveFeeBps = tc.draw(gs.integers({ minValue: 0, maxValue: 65_535 }));
      const payoutWallet = drawAddress(tc);
      const metadataUri = `ipfs://${tc.draw(gs.integers({ minValue: 0, maxValue: 1_000 }))}`;
      const hasCurveId = tc.draw(gs.booleans());
      const hasSalt = tc.draw(gs.booleans());
      const curveId = tc.draw(gs.integers({ minValue: 1, maxValue: 0xffff_ffff }));
      const salt = pad(toHex(tc.draw(gs.bigIntegers({ minValue: 1n, maxValue: 2n ** 256n - 1n }))), { size: 32 });

      const parameters: CreateLaunchParameters = {
        name,
        symbol,
        creatorBps,
        curveFeeBps,
        payoutWallet,
        metadataUri,
        ...(hasCurveId ? { curveId } : {}),
        ...(hasSalt ? { salt } : {}),
      };

      const request = buildCreateLaunchTransaction(launchpad, parameters);
      const decoded = decodeLaunchpadTransaction(request.data);
      expect(decoded.functionName).toBe(hasSalt ? "createLaunchVanity" : "createLaunch");
      const commonArgs = [name, symbol, creatorBps, curveFeeBps, payoutWallet, metadataUri];
      const expectedArgs = hasSalt
        ? (hasCurveId ? [...commonArgs, salt, curveId] : [...commonArgs, salt])
        : (hasCurveId ? [...commonArgs, curveId] : commonArgs);
      expect(decoded.args).toEqual(expectedArgs);
      expect(request.value).toBe(0n);

      expect(() => verifyCreateLaunchTransaction(confirmedFrom(request, account), launchpad, account, parameters))
        .not.toThrow();
      expectCode(
        () => verifyCreateLaunchTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          launchpad,
          account,
          parameters,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips curve buy and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const parameters = { token: drawAddress(tc), minTokensOut: drawAmount(tc, 0n), value: drawAmount(tc) };
      const request = buildCurveBuyTransaction(launchpad, parameters);
      const decoded = decodeLaunchpadTransaction(request.data);
      expect(decoded.functionName).toBe("buy");
      expect(decoded.args).toEqual([parameters.token, parameters.minTokensOut]);
      expect(request.value).toBe(parameters.value);

      expect(() => verifyCurveBuyTransaction(confirmedFrom(request, account), launchpad, account, parameters))
        .not.toThrow();
      expectCode(
        () => verifyCurveBuyTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          launchpad,
          account,
          parameters,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips curve sell and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const parameters = { token: drawAddress(tc), tokensIn: drawAmount(tc), minAmountOut: drawAmount(tc, 0n) };
      const request = buildCurveSellTransaction(launchpad, parameters);
      const decoded = decodeLaunchpadTransaction(request.data);
      expect(decoded.functionName).toBe("sell");
      expect(decoded.args).toEqual([parameters.token, parameters.tokensIn, parameters.minAmountOut]);

      expect(() => verifyCurveSellTransaction(confirmedFrom(request, account), launchpad, account, parameters))
        .not.toThrow();
      expectCode(
        () => verifyCurveSellTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          launchpad,
          account,
          parameters,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips graduate and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const token = drawAddress(tc);
      const request = buildGraduateTransaction(launchpad, token);
      const decoded = decodeLaunchpadTransaction(request.data);
      expect(decoded.functionName).toBe("graduate");
      expect(decoded.args).toEqual([token]);

      expect(() => verifyGraduateTransaction(confirmedFrom(request, account), launchpad, account, token))
        .not.toThrow();
      expectCode(
        () => verifyGraduateTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          launchpad,
          account,
          token,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips claim and claimAll and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const hasToken = tc.draw(gs.booleans());
      const token = hasToken ? drawAddress(tc) : undefined;
      const request = buildClaimTransaction(launchpad, token);
      const decoded = decodeLaunchpadTransaction(request.data);
      expect(decoded.functionName).toBe(hasToken ? "claimAll" : "claim");
      expect(decoded.args).toEqual(hasToken ? [token] : []);

      expect(() => verifyClaimTransaction(confirmedFrom(request, account), launchpad, account, token)).not.toThrow();
      expectCode(
        () => verifyClaimTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          launchpad,
          account,
          token,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips token approve and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const parameters = { token: drawAddress(tc), spender: drawAddress(tc), amount: drawAmount(tc, 0n) };
      const request = buildApproveTransaction(parameters.token, parameters.spender, parameters.amount);
      const decoded = decodeFunctionData({ abi: launchTokenAbi, data: request.data });
      expect(decoded.functionName).toBe("approve");
      expect(decoded.args).toEqual([parameters.spender, parameters.amount]);
      expect(request.to).toBe(parameters.token);

      expect(() => verifyApproveTransaction(confirmedFrom(request, account), account, parameters)).not.toThrow();
      expectCode(
        () => verifyApproveTransaction(confirmedFrom(request, account, perturb(tc, request.data)), account, parameters),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips router buy and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const parameters = {
        token: drawAddress(tc),
        minTokensOut: drawAmount(tc, 0n),
        deadline: drawAmount(tc, 0n),
        value: drawAmount(tc),
      };
      const request = buildRouterBuyTransaction(router, parameters);
      const decoded = decodeRouterTransaction(request.data);
      expect(decoded.functionName).toBe("buy");
      expect(decoded.args).toEqual([parameters.token, parameters.minTokensOut, parameters.deadline]);
      expect(request.value).toBe(parameters.value);

      expect(() => verifyRouterBuyTransaction(confirmedFrom(request, account), router, account, parameters))
        .not.toThrow();
      expectCode(
        () => verifyRouterBuyTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          router,
          account,
          parameters,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips router sell and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const parameters = {
        token: drawAddress(tc),
        tokensIn: drawAmount(tc),
        minAmountOut: drawAmount(tc, 0n),
        deadline: drawAmount(tc, 0n),
      };
      const request = buildRouterSellTransaction(router, parameters);
      const decoded = decodeRouterTransaction(request.data);
      expect(decoded.functionName).toBe("sell");
      expect(decoded.args).toEqual([
        parameters.token,
        parameters.tokensIn,
        parameters.minAmountOut,
        parameters.deadline,
      ]);

      expect(() => verifyRouterSellTransaction(confirmedFrom(request, account), router, account, parameters))
        .not.toThrow();
      expectCode(
        () => verifyRouterSellTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          router,
          account,
          parameters,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips swapExactIn for native and ERC-20 input and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const isNative = tc.draw(gs.booleans());
      const amountIn = drawAmount(tc);
      const parameters = {
        tokenIn: isNative ? zeroAddress : drawAddress(tc),
        tokenOut: drawAddress(tc),
        amountIn,
        amountOutMin: drawAmount(tc, 0n),
        recipient: drawAddress(tc),
        deadline: drawAmount(tc, 0n),
        ...(isNative ? { value: amountIn } : {}),
      };
      const request = buildSwapExactInTransaction(router, parameters);
      const decoded = decodeRouterTransaction(request.data);
      expect(decoded.functionName).toBe("swapExactIn");
      expect(decoded.args).toEqual([
        parameters.tokenIn,
        parameters.tokenOut,
        parameters.amountIn,
        parameters.amountOutMin,
        parameters.recipient,
        parameters.deadline,
      ]);
      expect(request.value).toBe(isNative ? amountIn : 0n);

      expect(() => verifySwapExactInTransaction(confirmedFrom(request, account), router, account, parameters))
        .not.toThrow();
      expectCode(
        () => verifySwapExactInTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          router,
          account,
          parameters,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });

  it("round-trips fee collection across amm and lb venues and rejects every calldata perturbation", () => {
    hegel.test((tc) => {
      const venue = tc.draw(gs.sampledFrom(["amm", "lb"] as const));
      const pair = drawAddress(tc);
      const request = buildCollectFeesTransaction(feeController, pair, venue);
      const decoded = decodeFunctionData({ abi: feeControllerAbi, data: request.data });
      expect(decoded.functionName).toBe(venue === "amm" ? "collectFees" : "collectLBFees");
      expect(decoded.args).toEqual([pair]);

      expect(() => verifyCollectFeesTransaction(confirmedFrom(request, account), feeController, account, pair, venue))
        .not.toThrow();
      expectCode(
        () => verifyCollectFeesTransaction(
          confirmedFrom(request, account, perturb(tc, request.data)),
          feeController,
          account,
          pair,
          venue,
        ),
        "CALLDATA_MISMATCH",
      );
    }, HEGEL_SETTINGS);
  });
});
