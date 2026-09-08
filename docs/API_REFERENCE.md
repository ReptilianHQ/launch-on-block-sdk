# API reference

This guide describes the 0.9.0 public API. The exact exports and declarations below
are generated from the built package and checked in CI. SDK amounts are `bigint`
in raw chain units, not display amounts; native quote currency uses the network's
`nativeCurrency.decimals`. Fee/slippage values use basis points (10,000 = 100%).
See the [quickstart](QUICKSTART.md) for complete, compiled examples.

## Choose a module

| Module | Use it for |
| --- | --- |
| `/deployments` | `getDeployment(chainId)` for contracts; `getChain` for network metadata; `listChains` for supported networks. Named mainnet/testnet deployments and `ROBINHOOD_*` address/start-block constants are aliases of the same manifest. |
| `/abis` | Typed contract calls and event decoding with `launchpadAbi`, `launchTokenAbi`, `routerAbi`, `feeControllerAbi`, `graduationPoolAbi`; venue identity reads with `lbFactoryIdentityAbi`, `lbRouterIdentityAbi`. `ABI_REVISION` and `abiSignatures` identify the reviewed interface set. |
| `/transactions` | Deterministic requests, transaction-intent verification, RPC quantity conversion, calldata decoding. |
| `/receipts` | Successful-receipt/event verification against an expected emitter and supplied fields. |
| `/economics` | Integer slippage arithmetic and validation using caller-supplied live terms. |
| `/compatibility` | Release identity, code hashes, proxy slots, and cross-contract wiring at a selected block. |
| `/escrows` | Verified escrow association and raw backing; no price or liquidity estimate. |
| `/indexing` | Event catalog, network manifests, dynamic-source discovery metadata. |
| `/vanity` | Offline CREATE2 prediction and bounded salt searches. |
| `/errors` | Stable SDK error codes, structured context, and `isSdkError`. |

Prepend `@reptilianhq/launch-on-block-sdk` to these module suffixes. The package
root re-exports these modules. The export-map table below lists every JSON asset,
including both provenance files, the indexing manifest/schema, and all event ABIs.
Do not import private `generated/` paths or copy whole compiler/Foundry artifacts.

## Deployment identity and indexing

`getChain` returns a `Deployment` whose `contracts` can be null. `getDeployment`
requires contracts and narrows the return type. Unknown chains throw
`UNSUPPORTED_CHAIN`; a known network without contracts throws `DEPLOYMENT_NOT_FOUND`.
`robinhoodMainnet` is chain 4663 and `robinhoodTestnet` is 46630. Records are frozen.

`contracts.startBlock` and indexing `startBlock` are conservative deployment replay
boundaries, not necessarily the Launchpad's creation block. On this gen-12 input,
mainnet starts at Launchpad creation (17,957,183); testnet begins at the first
contract boundary (92,793,378), eight blocks before Launchpad creation.

`getIndexingManifest` returns chain/release/deployment/ABI identities and fixed or
dynamic sources; `listIndexingManifests` returns all supported manifests.
`launchOnBlockEventCatalog` describes event names, signatures, topics, parameter
semantics, ABIs, and discovery rules. Coverage is `public_integration_events`, not
all private protocol events. See [indexing guidance](../indexing/README.md) and
[Envio](../examples/envio/README.md)/[The Graph](../examples/graph/README.md) starters.
A successful historical state read or bounded log query does not prove a complete
backfill will succeed. Test provider log ranges and retention for your deployment.

The public `/provenance/mainnet.json` and `/provenance/testnet.json` assets mirror
the public manifest. The repository's separate [internal metadata corrections](DEPLOYMENT_METADATA.md)
are not npm exports or a runtime source of governance authority.

## Build and verify transactions

Builders encode `{ to, data, value }`; they do not obtain quotes, simulate, sign,
submit, select gas/nonces, or enforce current protocol economics. Addresses and
numeric widths are checked, but valid encoding is not proof the chain will accept
it. Read live terms, apply your policy, and simulate before requesting a signature.

| Builder | Behavior |
| --- | --- |
| `buildCreateLaunchTransaction` | Selects `createLaunch` or `createLaunchVanity` when `salt` is provided. `curveId` selects the overload; omission leaves on-chain default selection. Salt must be nonzero bytes32. |
| `buildCurveBuyTransaction` | Encodes Launchpad `buy(token, minTokensOut)` with positive native `value`. |
| `buildCurveSellTransaction` | Encodes `sell(token, tokensIn, minAmountOut)` with positive token input and zero native value. |
| `buildGraduateTransaction` | Encodes `graduate(token)`; does not test graduation eligibility. |
| `buildClaimTransaction` | Omitted token encodes `claim()`; supplied token encodes `claimAll(token)`. |
| `buildApproveTransaction` | Encodes token `approve(spender, amount)`; amount is raw units. Choose allowances explicitly. |
| `buildRouterBuyTransaction`, `buildRouterSellTransaction` | Encode Router buy/sell with a deadline. Deadline validity is not checked against live time by the builder. |
| `buildSwapExactInTransaction` | Encodes exact-input swap with recipient/deadline/minimum output. Native input uses the zero-address sentinel and `value = amountIn`; ERC-20 input requires zero value. |
| `buildCollectFeesTransaction` | `venue: "amm"` encodes `collectFees(pair)`; `"lb"` encodes `collectLBFees(pair)`. |

Every builder has a matching `verify*Transaction` function listed in the exact
signatures below. It rebuilds expected intent and compares sender, target, native
value, and exact calldata. It does not verify receipt success, chain finality,
transaction hash, nonce, or gas settings. `ConfirmedTransactionLike` contains the
four required fields; use the separately fetched mined transaction, not the
original request, as evidence. Return values are decoded Launchpad/Router calls,
or `void` for approvals and fee collection.

`decodeLaunchpadTransaction` and `decodeRouterTransaction` decode supported calls
without proving sender, target, or execution. `toRpcTransactionRequest(request, gas)`
encodes native value and caller-selected positive gas as hex quantities.
`parseRpcTransactionRequest` validates/normalizes that RPC shape; it returns hex
quantities, not a bigint request, and does not prove the transaction's intent.

## Verify receipts

`assertSuccessfulReceipt` checks status. Every `verify*Receipt` also requires
successful status and a decodable event from the expected emitter. It returns the
first matching event and compares only the fields supplied in `expected`.
Omitted expected fields are not checked. It does not inspect the transaction
sender, target, value, or calldata, or bind itself to another transaction object.

| Function | Result / additional behavior |
| --- | --- |
| `verifyLaunchCreatedReceipt` | `LaunchCreatedResult` with token, creator, fees, payout wallet, metadata URI. |
| `verifyCurveSelectedReceipt` | `CurveSelectedResult` with token, curve ID/implementation, quote target. |
| `verifyLaunchCreationReceipt` | Both creation events and matching token across them. |
| `verifyBuyReceipt` | `BuyResult`; optional `minTokensOut` rejects output below the caller's minimum. |
| `verifySellReceipt` | `SellResult` with token, seller, input and output. |
| `verifyGraduatedReceipt` | `GraduatedResult` with pool and raw allocation amounts. |
| `verifyRouterSwapReceipt` | `RouterSwapResult` from the Router. |
| `verifyFeesCollectedReceipt` | `FeesCollectedResult` with protocol/creator/raw fee amounts. |

For end-to-end verification, fetch transaction and receipt using the same mined
hash, compare their block/hash association, verify intent, then verify expected
event fields. Multiple matching events require application-specific handling;
these helpers do not aggregate or choose a later event by expected values.

## Economics and vanity

`calculateSlippageFloor` accepts 0–10,000 bps and rounds down.
`calculateCreatorCutCapacity(maxGraduationCutBps, protocolCutBps)` subtracts
caller-supplied bounds, rejecting inconsistent terms. `validateFeeRange` returns
a fee only if it lies within supplied min/max bounds. `validateDeadline` accepts
`deadline >= currentTimestamp` in its local comparison; it does not fetch time or
guarantee later transaction acceptance. `validateNativeValue` derives native
value from token input and rejects a conflicting supplied value.

Read live fee/curve terms through the ABI as shown in the quickstart. Do not treat
the audit's historical fee constants or raise thresholds as permanent configuration.
`BASIS_POINTS_DENOMINATOR` is 10,000, `NATIVE_TOKEN_ADDRESS` is the zero address,
and `LAUNCH_TOKEN_TOTAL_SUPPLY` is 10^27 raw units (one billion tokens at 18 decimals)
for the pinned vanity creation code.

`predictLaunchTokenAddress` depends on the exact Launchpad, creator, name, symbol,
metadata URI, and nonzero 32-byte salt. `mineLaunchTokenVanitySalt` accepts a suffix
of 1–8 hex nibbles without `0x`, `startSalt` (default 1), and `maxAttempts` (default
100,000). It returns address/salt/attempts or null. After a null result continue at
`startSalt + BigInt(maxAttempts)`, within uint256 bounds. Run large browser searches
in a Worker. Prediction does not deploy a token or check address availability.
The regression test compares with a pinned production vector offline; it is not a
live RPC test on every run.

## Verification and errors

`assertCompatibleDeployment` reads one numbered safe block by default. Its
`DeploymentCompatibilityReport` includes chain/block/release/ABI identities, code
hashes, and wiring pointers. It does not establish operational health, price,
balances, pause state, current governance safety, or finality.

`readLaunchEscrowState` checks Launchpad mapping, deterministic deployer prediction,
non-empty code, and embedded Launchpad/token pointers. The escrow code check is
presence-only, not a bytecode-hash comparison. It returns `not_deployed` or
`deployed`; only the latter includes raw `backing`. Backing is protocol accounting,
not liquidity, TVL, price, redeemable value, or wallet value.

Both helpers accept `options.blockNumber`. A caller-selected block may be less
confirmed than safe; selecting it neither restores pruned state nor guarantees
finality. Transport/state-availability errors propagate without SDK-level retry.
The separate repository verification CLI retries recognized unavailable-state
errors at safe, then fails with provider guidance; see [release verification](RELEASING.md#live-deployment-verification).

Use `isSdkError` to distinguish SDK validation errors from transport or wallet
errors. `SdkError` carries `code`, optional `path`, `expected`, `actual`, and `cause`.
`toJSON()` includes its name/code/message and defined string context fields;
`cause` is omitted. `DeploymentCompatibilityError` extends `SdkError` with the
compatibility-specific code subset. Match codes rather than parsing message text.

| Code | Meaning / response |
| --- | --- |
| `ADMIN_MISMATCH` | Proxy admin differs from the pinned identity; stop verification. |
| `ABI_REVISION_MISMATCH` | Deployment and SDK ABI revisions differ; use matching artifacts. |
| `CALLDATA_MISMATCH` | Observed calldata differs from reviewed intent. |
| `CHAIN_MISMATCH` | RPC serves a different chain. |
| `CODE_HASH_MISMATCH` | Deployed runtime code differs from the pinned hash. |
| `CODE_MISSING` | Required code or numbered safe block is absent. |
| `DEADLINE_EXPIRED` | Deadline is earlier than the supplied timestamp. |
| `DEPLOYMENT_NOT_FOUND` | Known network has no recorded contract deployment. |
| `EVENT_NOT_FOUND` | No decodable expected event from the requested emitter. |
| `FEE_OUT_OF_RANGE` | Fee lies outside caller-supplied bounds. |
| `IMPLEMENTATION_MISMATCH` | Proxy/direct implementation identity differs. |
| `INVALID_ADDRESS` | Address is invalid or disallowed at that parameter. |
| `INVALID_ARGUMENT` | Numeric/format constraint failed; inspect path/expected. |
| `INVALID_CALLDATA` | Calldata is malformed or cannot be decoded. |
| `INVALID_RPC_QUANTITY` | RPC value/gas is not a valid hex quantity. |
| `NATIVE_VALUE_MISMATCH` | Swap value conflicts with input token/amount. |
| `OUTPUT_BELOW_MINIMUM` | Buy receipt output is below the supplied minimum. |
| `POINTER_MISMATCH` | Contract pointer or escrow association differs. |
| `RECEIPT_FIELD_MISMATCH` | A supplied expected event field differs. |
| `RECEIPT_REVERTED` | Receipt status does not indicate success. |
| `TERMS_INCONSISTENT` | Caller-supplied fee/cut bounds contradict each other. |
| `UNEXPECTED_SENDER` | Mined transaction sender differs from reviewed account. |
| `UNEXPECTED_TARGET` | Mined transaction target differs from reviewed contract. |
| `UNEXPECTED_VALUE` | Mined transaction native value differs from reviewed intent. |
| `UNSUPPORTED_CHAIN` | Chain is absent from the SDK manifest. |
| `UNSUPPORTED_FUNCTION` | Decoded function is outside the supported helper set. |

The declarations below are reference signatures, not standalone runnable examples.
Relative imports describe relationships inside the published package. `/abis`
re-exports preserve generated literal ABI types; import the public names rather
than following the internal path shown in that declaration.

<!-- BEGIN GENERATED -->

## Package exports

Generated from package version 0.9.0; requires Node >=22 and viem >=2.21.0 <3.

Import the package root for all named exports, or a narrow module below. JSON entries are data assets, not functions.

| Subpath | Target(s) |
| --- | --- |
| `.` | `./dist/index.d.ts`, `./dist/index.js` |
| `./abis` | `./dist/abis.d.ts`, `./dist/abis.js` |
| `./deployments` | `./dist/deployments.d.ts`, `./dist/deployments.js` |
| `./errors` | `./dist/errors.d.ts`, `./dist/errors.js` |
| `./economics` | `./dist/economics.d.ts`, `./dist/economics.js` |
| `./transactions` | `./dist/transactions.d.ts`, `./dist/transactions.js` |
| `./receipts` | `./dist/receipts.d.ts`, `./dist/receipts.js` |
| `./compatibility` | `./dist/compatibility.d.ts`, `./dist/compatibility.js` |
| `./escrows` | `./dist/escrows.d.ts`, `./dist/escrows.js` |
| `./indexing` | `./dist/indexing.d.ts`, `./dist/indexing.js` |
| `./vanity` | `./dist/vanity.d.ts`, `./dist/vanity.js` |
| `./indexing/manifest.json` | `./indexing/manifest.json` |
| `./indexing/manifest.schema.json` | `./indexing/manifest.schema.json` |
| `./indexing/abis/Launchpad.events.json` | `./indexing/abis/Launchpad.events.json` |
| `./indexing/abis/Router.events.json` | `./indexing/abis/Router.events.json` |
| `./indexing/abis/FeeController.events.json` | `./indexing/abis/FeeController.events.json` |
| `./indexing/abis/LaunchToken.events.json` | `./indexing/abis/LaunchToken.events.json` |
| `./indexing/abis/GraduationPool.events.json` | `./indexing/abis/GraduationPool.events.json` |
| `./provenance/mainnet.json` | `./dist/provenance/mainnet.json` |
| `./provenance/testnet.json` | `./dist/provenance/testnet.json` |
| `./indexing/mainnet.json` | `./indexing/mainnet.json` |
| `./indexing/testnet.json` | `./indexing/testnet.json` |

## ./abis

Runtime exports: `ABI_REVISION`, `abiSignatures`, `feeControllerAbi`, `graduationPoolAbi`, `launchTokenAbi`, `launchpadAbi`, `lbFactoryIdentityAbi`, `lbRouterIdentityAbi`, `routerAbi`.

Exact public declaration surface (including parameter, result, and option types):

```ts
export { ABI_REVISION, abiSignatures, feeControllerAbi, graduationPoolAbi, launchpadAbi, launchTokenAbi, lbFactoryIdentityAbi, lbRouterIdentityAbi, routerAbi, } from "./generated/abis.js";
```

## ./deployments

Runtime exports: `ROBINHOOD_CHAIN_ID`, `ROBINHOOD_CHAIN_TESTNET_ID`, `ROBINHOOD_MAINNET_LAUNCHPAD_ADDRESS`, `ROBINHOOD_MAINNET_LAUNCHPAD_START_BLOCK`, `ROBINHOOD_MAINNET_WETH_ADDRESS`, `ROBINHOOD_TESTNET_LAUNCHPAD_ADDRESS`, `ROBINHOOD_TESTNET_LAUNCHPAD_START_BLOCK`, `ROBINHOOD_TESTNET_WETH_ADDRESS`, `deploymentManifest`, `getChain`, `getDeployment`, `listChains`, `robinhoodMainnet`, `robinhoodTestnet`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import type { Address, Hex } from "viem";
export declare const ROBINHOOD_CHAIN_ID = 4663;
export declare const ROBINHOOD_CHAIN_TESTNET_ID = 46630;
export type BlockchainEnvironment = "mainnet" | "testnet" | "local";
export interface PublicDeploymentManifestContracts {
    readonly generation: string;
    readonly start_block: number;
    readonly launchpad: Address;
    readonly fee_controller: Address;
    readonly fee_controller_implementation: Address;
    readonly fee_controller_admin: Address;
    readonly router: Address;
    readonly lb_factory: Address;
    readonly lb_pair_implementation: Address;
    readonly lb_router: Address;
    readonly launchpad_type: "immutable";
    readonly curve_id_1: Address;
    readonly pool_deployer: Address;
    readonly escrow_deployer: Address;
    readonly proxy_upgrade_gate: Address;
    readonly release_id: string;
    readonly abi_revision: string;
    readonly runtime_code_hashes: {
        readonly launchpad: Hex;
        readonly fee_controller: Hex;
        readonly fee_controller_implementation: Hex;
        readonly router: Hex;
        readonly lb_factory: Hex;
        readonly lb_pair_implementation: Hex;
        readonly lb_router: Hex;
        readonly fee_controller_admin: Hex;
        readonly curve_id_1: Hex;
        readonly pool_deployer: Hex;
        readonly escrow_deployer: Hex;
        readonly proxy_upgrade_gate: Hex;
        readonly escrow_implementation: Hex;
    };
    readonly implementations: {
        readonly launchpad: null;
        readonly fee_controller: {
            readonly address: Address;
            readonly runtime_code_hash: Hex;
        };
    };
    readonly escrow_implementation: Address;
}
export interface PublicDeploymentManifestNetwork {
    readonly name: string;
    readonly id: string;
    readonly blockchain_env: BlockchainEnvironment;
    readonly chain_id: number;
    readonly rpc_url: string;
    readonly explorer_url: string | null;
    readonly native_currency: {
        readonly name: string;
        readonly symbol: string;
        readonly decimals: number;
    };
    readonly addresses: {
        readonly w_native: Address | null;
        readonly usdg: Address | null;
    };
    readonly contracts: PublicDeploymentManifestContracts | null;
}
export interface PublicDeploymentManifest {
    readonly schema_version: 1;
    readonly active_network: "mainnet";
    readonly robinhood: {
        readonly mainnet: PublicDeploymentManifestNetwork;
        readonly testnet: PublicDeploymentManifestNetwork;
    };
}
export declare const deploymentManifest: PublicDeploymentManifest;
export interface ContractIdentity {
    readonly address: Address;
    readonly runtimeCodeHash: Hex;
}
export interface ProtocolContracts {
    readonly releaseId: string;
    readonly abiRevision: string;
    readonly generation: string;
    readonly startBlock: number;
    readonly launchpad: Address;
    readonly launchpadType: "immutable";
    readonly feeController: Address;
    readonly router: Address;
    readonly lbFactory: Address;
    readonly lbPairImplementation: Address;
    readonly lbRouter: Address;
    readonly feeControllerAdmin: ContractIdentity;
    readonly defaultCurve: ContractIdentity & {
        readonly id: number;
    };
    readonly graduationPoolDeployer: ContractIdentity;
    readonly launchEscrowDeployer: ContractIdentity & {
        readonly implementation: ContractIdentity;
    };
    readonly proxyUpgradeGate: ContractIdentity;
    readonly runtimeCodeHashes: {
        readonly launchpad: Hex;
        readonly feeController: Hex;
        readonly router: Hex;
        readonly lbFactory: Hex;
        readonly lbPairImplementation: Hex;
        readonly lbRouter: Hex;
        readonly curveId1: Hex;
        readonly poolDeployer: Hex;
        readonly escrowDeployer: Hex;
        readonly escrowImplementation: Hex;
        readonly proxyUpgradeGate: Hex;
        readonly feeControllerAdmin: Hex;
    };
    readonly implementations: {
        readonly launchpad: null;
        readonly feeController: ContractIdentity;
    };
}
export interface Deployment {
    readonly name: string;
    readonly blockchainEnvironment: BlockchainEnvironment;
    readonly chainId: number;
    readonly rpcUrl: string;
    readonly explorerUrl: string | null;
    readonly nativeCurrency: {
        readonly name: string;
        readonly symbol: string;
        readonly decimals: number;
    };
    readonly addresses: {
        readonly wNative: Address | null;
        readonly usdg: Address | null;
    };
    readonly contracts: ProtocolContracts | null;
}
export declare function getChain(chainId: number): Deployment;
export declare function getDeployment(chainId: number): Deployment & {
    contracts: ProtocolContracts;
};
export declare function listChains(): readonly Deployment[];
export declare const robinhoodMainnet: Deployment & {
    contracts: ProtocolContracts;
};
export declare const robinhoodTestnet: Deployment & {
    contracts: ProtocolContracts;
};
export declare const ROBINHOOD_MAINNET_LAUNCHPAD_ADDRESS: `0x${string}`;
export declare const ROBINHOOD_MAINNET_LAUNCHPAD_START_BLOCK: number;
export declare const ROBINHOOD_MAINNET_WETH_ADDRESS: Address;
export declare const ROBINHOOD_TESTNET_LAUNCHPAD_ADDRESS: `0x${string}`;
export declare const ROBINHOOD_TESTNET_LAUNCHPAD_START_BLOCK: number;
export declare const ROBINHOOD_TESTNET_WETH_ADDRESS: Address;
```

## ./errors

Runtime exports: `SdkError`, `isSdkError`.

Exact public declaration surface (including parameter, result, and option types):

```ts
/** Stable machine-readable failures emitted by the SDK's own validation boundaries. */
export type SdkErrorCode = "ADMIN_MISMATCH" | "ABI_REVISION_MISMATCH" | "CALLDATA_MISMATCH" | "CHAIN_MISMATCH" | "CODE_HASH_MISMATCH" | "CODE_MISSING" | "DEADLINE_EXPIRED" | "DEPLOYMENT_NOT_FOUND" | "EVENT_NOT_FOUND" | "FEE_OUT_OF_RANGE" | "IMPLEMENTATION_MISMATCH" | "INVALID_ADDRESS" | "INVALID_ARGUMENT" | "INVALID_CALLDATA" | "INVALID_RPC_QUANTITY" | "NATIVE_VALUE_MISMATCH" | "OUTPUT_BELOW_MINIMUM" | "POINTER_MISMATCH" | "RECEIPT_FIELD_MISMATCH" | "RECEIPT_REVERTED" | "TERMS_INCONSISTENT" | "UNEXPECTED_SENDER" | "UNEXPECTED_TARGET" | "UNEXPECTED_VALUE" | "UNSUPPORTED_CHAIN" | "UNSUPPORTED_FUNCTION";
export interface SdkErrorOptions {
    path?: string;
    expected?: string;
    actual?: string;
    cause?: unknown;
}
export declare class SdkError extends Error {
    readonly code: SdkErrorCode;
    readonly path?: string;
    readonly expected?: string;
    readonly actual?: string;
    constructor(code: SdkErrorCode, message: string, options?: SdkErrorOptions);
    toJSON(): Record<string, string>;
}
export declare function isSdkError(error: unknown): error is SdkError;
```

## ./economics

Runtime exports: `BASIS_POINTS_DENOMINATOR`, `NATIVE_TOKEN_ADDRESS`, `calculateCreatorCutCapacity`, `calculateSlippageFloor`, `validateDeadline`, `validateFeeRange`, `validateNativeValue`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import { type Address } from "viem";
export declare const BASIS_POINTS_DENOMINATOR = 10000;
export declare const NATIVE_TOKEN_ADDRESS: Address;
/**
 * Applies a caller-selected slippage tolerance and rounds down exactly as Solidity does.
 * Product-specific tolerance limits belong to the caller; this helper accepts the full bps range.
 */
export declare function calculateSlippageFloor(quotedAmountOut: bigint, slippageBps: number): bigint;
/** Calculates the largest creator graduation cut allowed by caller-supplied live terms. */
export declare function calculateCreatorCutCapacity(maxGraduationCutBps: number, protocolCutBps: number): number;
/** Validates a fee against caller-supplied live bounds and returns the validated value. */
export declare function validateFeeRange(feeBps: number, minimumFeeBps: number, maximumFeeBps: number): number;
/**
 * Validates deadline >= currentTimestamp using caller-supplied integer timestamps.
 * Equality passes this local check; it does not guarantee later on-chain acceptance.
 */
export declare function validateDeadline(deadline: bigint, currentTimestamp: bigint): bigint;
/**
 * Derives the only valid transaction value for an exact-input swap and, when supplied,
 * verifies that a caller-provided value agrees with both tokenIn and amountIn.
 */
export declare function validateNativeValue(tokenIn: Address, amountIn: bigint, value?: bigint): bigint;
```

## ./transactions

Runtime exports: `buildApproveTransaction`, `buildClaimTransaction`, `buildCollectFeesTransaction`, `buildCreateLaunchTransaction`, `buildCurveBuyTransaction`, `buildCurveSellTransaction`, `buildGraduateTransaction`, `buildRouterBuyTransaction`, `buildRouterSellTransaction`, `buildSwapExactInTransaction`, `decodeLaunchpadTransaction`, `decodeRouterTransaction`, `parseRpcTransactionRequest`, `toRpcTransactionRequest`, `verifyApproveTransaction`, `verifyClaimTransaction`, `verifyCollectFeesTransaction`, `verifyCreateLaunchTransaction`, `verifyCurveBuyTransaction`, `verifyCurveSellTransaction`, `verifyGraduateTransaction`, `verifyRouterBuyTransaction`, `verifyRouterSellTransaction`, `verifySwapExactInTransaction`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import { type Address, type Hex } from "viem";
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
export declare function buildCreateLaunchTransaction(launchpad: Address, parameters: CreateLaunchParameters): TransactionRequest;
export declare function buildCurveBuyTransaction(launchpad: Address, parameters: {
    token: Address;
    minTokensOut: bigint;
    value: bigint;
}): TransactionRequest;
export declare function buildCurveSellTransaction(launchpad: Address, parameters: {
    token: Address;
    tokensIn: bigint;
    minAmountOut: bigint;
}): TransactionRequest;
export declare function buildGraduateTransaction(launchpad: Address, token: Address): TransactionRequest;
export declare function buildClaimTransaction(launchpad: Address, token?: Address): TransactionRequest;
export declare function buildApproveTransaction(token: Address, spender: Address, amount: bigint): TransactionRequest;
export declare function buildRouterBuyTransaction(router: Address, parameters: {
    token: Address;
    minTokensOut: bigint;
    deadline: bigint;
    value: bigint;
}): TransactionRequest;
export declare function buildRouterSellTransaction(router: Address, parameters: {
    token: Address;
    tokensIn: bigint;
    minAmountOut: bigint;
    deadline: bigint;
}): TransactionRequest;
export declare function buildSwapExactInTransaction(router: Address, parameters: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMin: bigint;
    recipient: Address;
    deadline: bigint;
    value?: bigint;
}): TransactionRequest;
export declare function buildCollectFeesTransaction(feeController: Address, pair: Address, venue: "amm" | "lb"): TransactionRequest;
export declare function toRpcTransactionRequest(request: TransactionRequest, gas: bigint): RpcTransactionRequest;
export declare function parseRpcTransactionRequest(value: {
    to: string;
    data: string;
    value: string;
    gas: string;
}): RpcTransactionRequest;
export declare function verifyCreateLaunchTransaction(transaction: ConfirmedTransactionLike, launchpad: Address, account: Address, parameters: CreateLaunchParameters): DecodedLaunchpadTransaction;
export declare function verifyCurveBuyTransaction(transaction: ConfirmedTransactionLike, launchpad: Address, account: Address, parameters: {
    token: Address;
    minTokensOut: bigint;
    value: bigint;
}): DecodedLaunchpadTransaction;
export declare function verifyCurveSellTransaction(transaction: ConfirmedTransactionLike, launchpad: Address, account: Address, parameters: {
    token: Address;
    tokensIn: bigint;
    minAmountOut: bigint;
}): DecodedLaunchpadTransaction;
export declare function verifyGraduateTransaction(transaction: ConfirmedTransactionLike, launchpad: Address, account: Address, token: Address): DecodedLaunchpadTransaction;
export declare function verifyClaimTransaction(transaction: ConfirmedTransactionLike, launchpad: Address, account: Address, token?: Address): DecodedLaunchpadTransaction;
export declare function verifyApproveTransaction(transaction: ConfirmedTransactionLike, account: Address, parameters: {
    token: Address;
    spender: Address;
    amount: bigint;
}): void;
export declare function verifyRouterBuyTransaction(transaction: ConfirmedTransactionLike, router: Address, account: Address, parameters: {
    token: Address;
    minTokensOut: bigint;
    deadline: bigint;
    value: bigint;
}): DecodedRouterTransaction;
export declare function verifyRouterSellTransaction(transaction: ConfirmedTransactionLike, router: Address, account: Address, parameters: {
    token: Address;
    tokensIn: bigint;
    minAmountOut: bigint;
    deadline: bigint;
}): DecodedRouterTransaction;
export declare function verifySwapExactInTransaction(transaction: ConfirmedTransactionLike, router: Address, account: Address, parameters: {
    tokenIn: Address;
    tokenOut: Address;
    amountIn: bigint;
    amountOutMin: bigint;
    recipient: Address;
    deadline: bigint;
    value?: bigint;
}): DecodedRouterTransaction;
export declare function verifyCollectFeesTransaction(transaction: ConfirmedTransactionLike, feeController: Address, account: Address, pair: Address, venue: "amm" | "lb"): void;
export type DecodedLaunchpadTransaction = {
    functionName: "createLaunch";
    args: readonly [string, string, number, number, Address, string] | readonly [string, string, number, number, Address, string, number];
} | {
    functionName: "createLaunchVanity";
    args: readonly [string, string, number, number, Address, string, Hex] | readonly [string, string, number, number, Address, string, Hex, number];
} | {
    functionName: "buy";
    args: readonly [Address, bigint];
} | {
    functionName: "sell";
    args: readonly [Address, bigint, bigint];
} | {
    functionName: "graduate";
    args: readonly [Address];
} | {
    functionName: "claim";
    args: readonly [];
} | {
    functionName: "claimAll";
    args: readonly [Address];
};
export declare function decodeLaunchpadTransaction(data: Hex): DecodedLaunchpadTransaction;
export type DecodedRouterTransaction = {
    functionName: "buy";
    args: readonly [Address, bigint, bigint];
} | {
    functionName: "sell";
    args: readonly [Address, bigint, bigint, bigint];
} | {
    functionName: "swapExactIn";
    args: readonly [Address, Address, bigint, bigint, Address, bigint];
};
export declare function decodeRouterTransaction(data: Hex): DecodedRouterTransaction;
```

## ./receipts

Runtime exports: `assertSuccessfulReceipt`, `verifyBuyReceipt`, `verifyCurveSelectedReceipt`, `verifyFeesCollectedReceipt`, `verifyGraduatedReceipt`, `verifyLaunchCreatedReceipt`, `verifyLaunchCreationReceipt`, `verifyRouterSwapReceipt`, `verifySellReceipt`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import { type Address, type Hex } from "viem";
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
export declare function assertSuccessfulReceipt(receipt: ReceiptLike): void;
export declare function verifyLaunchCreatedReceipt(receipt: ReceiptLike, launchpad: Address, expected?: Partial<LaunchCreatedResult>): LaunchCreatedResult;
export declare function verifyCurveSelectedReceipt(receipt: ReceiptLike, launchpad: Address, expected?: Partial<CurveSelectedResult>): CurveSelectedResult;
/** Requires both creation events and proves that they describe the same launch token. */
export declare function verifyLaunchCreationReceipt(receipt: ReceiptLike, launchpad: Address, expected?: {
    launch?: Partial<LaunchCreatedResult>;
    curve?: Partial<CurveSelectedResult>;
}): LaunchCreationResult;
export declare function verifyBuyReceipt(receipt: ReceiptLike, launchpad: Address, expected?: Partial<Pick<BuyResult, "token" | "buyer" | "amountIn">> & {
    minTokensOut?: bigint;
}): BuyResult;
export declare function verifySellReceipt(receipt: ReceiptLike, launchpad: Address, expected?: Partial<Pick<SellResult, "token" | "seller">>): SellResult;
export declare function verifyGraduatedReceipt(receipt: ReceiptLike, launchpad: Address, expected?: Partial<Pick<GraduatedResult, "token" | "pool">>): GraduatedResult;
export declare function verifyRouterSwapReceipt(receipt: ReceiptLike, router: Address, expected?: Partial<Pick<RouterSwapResult, "sender" | "pool" | "to">>): RouterSwapResult;
export declare function verifyFeesCollectedReceipt(receipt: ReceiptLike, feeController: Address, expected?: Partial<Pick<FeesCollectedResult, "pair" | "caller">>): FeesCollectedResult;
```

## ./compatibility

Runtime exports: `DeploymentCompatibilityError`, `assertCompatibleDeployment`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import { type Address, type PublicClient } from "viem";
import type { Deployment, ProtocolContracts } from "./deployments.js";
import { SdkError, type SdkErrorCode } from "./errors.js";
export type DeploymentCompatibilityErrorCode = Extract<SdkErrorCode, "ADMIN_MISMATCH" | "ABI_REVISION_MISMATCH" | "CHAIN_MISMATCH" | "CODE_MISSING" | "CODE_HASH_MISMATCH" | "IMPLEMENTATION_MISMATCH" | "POINTER_MISMATCH">;
export declare class DeploymentCompatibilityError extends SdkError {
    readonly path: string;
    readonly expected: string;
    readonly actual: string;
    readonly code: DeploymentCompatibilityErrorCode;
    constructor(code: DeploymentCompatibilityErrorCode, path: string, expected: string, actual: string);
}
export interface DeploymentCompatibilityReport {
    chainId: number;
    blockNumber: bigint;
    releaseId: string;
    abiRevision: string;
    codeHashes: ProtocolContracts["runtimeCodeHashes"];
    pointers: {
        launchpadFeeController: Address;
        launchpadWNative: Address;
        launchpadGovernance: Address;
        launchpadGraduationPoolDeployer: Address;
        launchpadEscrowDeployer: Address;
        launchpadDefaultCurveId: number;
        launchpadDefaultCurve: Address;
        escrowImplementation: Address;
        feeControllerLaunchpad: Address;
        feeControllerLbFactory: Address;
        feeControllerProxyAdmin: Address;
        feeControllerProxyAdminOwner: Address;
        proxyUpgradeGateTimelock: Address;
        routerLaunchpad: Address;
        routerLbFactory: Address;
        routerWNative: Address;
        lbFactoryFeeRecipient: Address;
        lbFactoryPairImplementation: Address;
        lbRouterFactory: Address;
        lbRouterWNative: Address;
    };
}
/**
 * Proves that an RPC is serving the manifest-bound release before a consumer trusts it.
 * This checks identity and wiring, not operational state such as pause status or balances.
 * Reads a single numbered `safe` block by default; the RPC must retain state at that height.
 * `options.blockNumber` selects an explicit block under the caller's confirmation policy.
 * It does not imply safe/finalized status. Unavailable historical state propagates as an RPC error;
 * this runtime-neutral helper does not retry or fall back to a more recent block.
 */
export declare function assertCompatibleDeployment(client: PublicClient, deployment: Deployment & {
    contracts: ProtocolContracts;
}, options?: {
    blockNumber?: bigint;
}): Promise<DeploymentCompatibilityReport>;
```

## ./escrows

Runtime exports: `readLaunchEscrowState`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import { type Address, type PublicClient } from "viem";
import type { Deployment, ProtocolContracts } from "./deployments.js";
interface LaunchEscrowStateBase {
    /** Chain and block at which every returned value was read. */
    chainId: number;
    blockNumber: bigint;
    launchpad: Address;
    token: Address;
    /** Deterministic address derived by the reviewed escrow deployer. */
    predictedEscrow: Address;
}
export type LaunchEscrowState = (LaunchEscrowStateBase & {
    status: "not_deployed";
    escrow: null;
    backing: null;
}) | (LaunchEscrowStateBase & {
    status: "deployed";
    escrow: Address;
    /** Raw protocol accounting value. This is not liquidity, TVL, price, or wallet value. */
    backing: bigint;
});
/**
 * Reads and verifies the escrow associated with one launch token at a single safe block.
 * The RPC must retain state at that height. `options.blockNumber` overrides the selected block
 * under the caller's confirmation policy; an explicit block is not necessarily safe/finalized.
 * Unavailable historical state propagates as an RPC error without retries or block fallback.
 *
 * The returned `backing` is deliberately unpriced protocol accounting data. Consumers must not
 * present it as liquidity, TVL, redeemable value, or wallet value without a separate reviewed model.
 */
export declare function readLaunchEscrowState(client: PublicClient, deployment: Deployment & {
    contracts: ProtocolContracts;
}, token: Address, options?: {
    blockNumber?: bigint;
}): Promise<LaunchEscrowState>;
export {};
```

## ./indexing

Runtime exports: `getIndexingManifest`, `launchOnBlockEventCatalog`, `listIndexingManifests`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import { type AbiEvent, type Address, type Hex } from "viem";
export type IndexingContractName = "Launchpad" | "Router" | "FeeController" | "LaunchToken" | "GraduationPool";
export interface IndexingEventParameter {
    name: string;
    type: string;
    indexed: boolean;
    semantic: string;
    asset?: string;
    decimalsSource?: string;
}
export interface IndexingEventDefinition {
    name: string;
    signature: string;
    topic0: Hex;
    description: string;
    parameters: readonly IndexingEventParameter[];
}
export interface IndexingContractDefinition {
    name: IndexingContractName;
    abiFile: string;
    sourceKind: "fixed" | "dynamic";
    discoveredBy: null | {
        contract: "Launchpad";
        event: "LaunchCreated" | "Graduated";
        addressParameter: "token" | "pool";
        startFrom: "discovery-block";
    };
    eventAbi: readonly AbiEvent[];
    events: readonly IndexingEventDefinition[];
}
export interface IndexingSource {
    contract: IndexingContractName;
    kind: "fixed" | "dynamic";
    address: Address | null;
    startBlock: number | null;
    discoveredBy: IndexingContractDefinition["discoveredBy"];
}
export interface IndexingNetworkManifest {
    schemaVersion: 1;
    coverage: "public_integration_events";
    caip2: `eip155:${number}`;
    chainId: number;
    network: string;
    deploymentId: string;
    releaseId: string;
    abiRevision: string;
    startBlock: number;
    sources: readonly IndexingSource[];
}
export interface IndexingMaterialization {
    name: string;
    description: string;
    key: "chainId:lowercase-address";
    fields: Record<string, {
        type: "String" | "BigInt";
        required: boolean;
    }>;
    updates: readonly {
        contract: IndexingContractName;
        event: string;
        keyParameter: string;
        set: Record<string, {
            parameter: string;
        } | {
            blockNumber: true;
        }>;
    }[];
}
export declare const launchOnBlockEventCatalog: {
    schemaVersion: 1;
    coverage: "public_integration_events";
    abiRevision: "sha256:635cf660979631c57c4fa5cdf28460f8a4293272ebe153f0064e3758c6a5b9be";
    materializations: readonly IndexingMaterialization[];
    contracts: IndexingContractDefinition[];
};
export declare function getIndexingManifest(chainId: number): IndexingNetworkManifest;
export declare function listIndexingManifests(): readonly IndexingNetworkManifest[];
```

## ./vanity

Runtime exports: `LAUNCH_TOKEN_TOTAL_SUPPLY`, `mineLaunchTokenVanitySalt`, `predictLaunchTokenAddress`.

Exact public declaration surface (including parameter, result, and option types):

```ts
import { type Address, type Hex } from "viem";
export declare const LAUNCH_TOKEN_TOTAL_SUPPLY: bigint;
export interface PredictLaunchTokenAddressParameters {
    launchpad: Address;
    creator: Address;
    name: string;
    symbol: string;
    metadataUri: string;
    salt: Hex;
}
export interface MineLaunchTokenVanitySaltParameters extends Omit<PredictLaunchTokenAddressParameters, "salt"> {
    /** One through eight hexadecimal nibbles, without a 0x prefix. */
    suffix: string;
    /** First candidate to inspect. Defaults to 1. */
    startSalt?: bigint;
    /** Bounded work for this batch. Defaults to 100,000 attempts. */
    maxAttempts?: number;
}
export interface LaunchTokenVanityResult {
    address: Address;
    salt: Hex;
    attempts: number;
}
/**
 * Predicts the token deployed by Launchpad.createLaunchVanity for exact launch metadata.
 *
 * The Launchpad namespaces the caller salt with msg.sender before passing it to CREATE2.
 * Changing creator, name, symbol, metadata URI, salt, or Launchpad changes the result.
 */
export declare function predictLaunchTokenAddress(parameters: PredictLaunchTokenAddressParameters): Address;
/**
 * Searches a deterministic, bounded salt range for a vanity token suffix.
 *
 * This function performs CPU work only. Browser consumers should call it in a Web Worker.
 * Return null to continue with another batch beginning after the attempted range.
 */
export declare function mineLaunchTokenVanitySalt(parameters: MineLaunchTokenVanitySaltParameters): LaunchTokenVanityResult | null;
```

<!-- END GENERATED -->
