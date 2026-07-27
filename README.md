# Launch On Block SDK

Public TypeScript SDK, contract interfaces, ABIs, and deployment metadata for integrating with the
Launch On Block protocol on Robinhood Chain.

The package is runtime-neutral. It provides deterministic transaction requests and verification tools,
but it does not select a wallet, RPC provider, gas policy, nonce policy, application backend, or user
authorization model.

## What it provides

- Narrow, generated ABI subsets with literal `as const` types.
- Typed, chain-scoped deployment metadata and replay boundaries.
- Transaction builders and calldata verification.
- Receipt verification tied to the expected contract and transaction envelope.
- Deployment compatibility checks for runtime bytecode, proxies, and cross-contract wiring.
- A machine-readable public event catalog with neutral assets and runnable Graph and Envio examples.
- Stable SDK error codes and deterministic protocol arithmetic.

## ABI support boundary

The SDK publishes only interfaces that applications are expected to read or call directly:

- Launchpad, launch-token, Router, FeeController, and graduation-pool interfaces.
- Narrow LB factory and Router identity reads used to identify the configured liquidity venue.
- ABI revision and signature metadata for compatibility evidence.

Deployment verification also needs narrow interfaces for the launch-escrow deployer, proxy admin, and
proxy upgrade gate. Those interfaces are committed in the generated artifact and bundled with the SDK
because `assertCompatibleDeployment()` uses them internally, but they are not public package exports.
Consumers should call the compatibility helper instead of rebuilding governance and proxy checks.

The raw launch-escrow ABI remains internal. Consumers that need protocol reconciliation can use
`readLaunchEscrowState()` from the `./escrows` export. It reads one numbered safe block, verifies the
Launchpad mapping, deterministic deployer prediction, deployed bytecode, launchpad pointer, and token
pointer, then returns raw `backing`. That value is protocol accounting data—not liquidity, TVL, price,
redeemable value, or wallet value.

Administrative mutation interfaces are outside the public SDK boundary. The private contract repository
remains authoritative for deployment, activation, governance, and upgrades.

## Indexing

Import the typed catalog and exact network manifests from the SDK:

```ts
import {
  getIndexingManifest,
  launchOnBlockEventCatalog,
} from "@reptilianhq/launch-on-block-sdk/indexing";

const mainnet = getIndexingManifest(4663);
console.log(mainnet.caip2, mainnet.startBlock, launchOnBlockEventCatalog.abiRevision);
```

Stable machine-readable files are packaged under exact `indexing/` exports. They include:

- a neutral JSON manifest and JSON Schema;
- event-only JSON ABIs with canonical signatures, `topic0` hashes, indexed fields, descriptions, and
  raw-value semantics.

For example, import `@reptilianhq/launch-on-block-sdk/indexing/manifest.json` or an exact ABI path such
as `@reptilianhq/launch-on-block-sdk/indexing/abis/Launchpad.events.json`. Complete Envio and The Graph
starters live under [`examples/`](examples/) in the repository. They share the neutral assets, retain
every decoded parameter, register dynamic sources, and are drift-checked without becoming npm API.

The manifest declares `coverage: "public_integration_events"`. This is the reviewed third-party event
surface, not every event that may exist in the private protocol implementation. Consumers should retain
the coverage marker and ABI revision with their integration evidence. See
[`indexing/README.md`](indexing/README.md) for dynamic-source and reorg guidance.

## Installation

Install the public package from npm:

```sh
npm install @reptilianhq/launch-on-block-sdk viem
```

Releases use npm trusted publishing with provenance from the public GitHub repository and protected
release environment. See [`docs/RELEASING.md`](docs/RELEASING.md).

Version `0.6.0` makes the public integration boundary available under Apache-2.0.

## Usage

Import ABIs from narrow package subpaths so TypeScript preserves their literal types:

```ts
import { launchpadAbi, launchTokenAbi } from "@reptilianhq/launch-on-block-sdk/abis";
```

Build and verify transactions without binding the SDK to a wallet implementation:

```ts
import {
  buildCurveBuyTransaction,
  getDeployment,
  verifyBuyReceipt,
} from "@reptilianhq/launch-on-block-sdk";

const deployment = getDeployment(4663);
const request = buildCurveBuyTransaction(deployment.contracts.launchpad, {
  token,
  minTokensOut,
  value,
});

const hash = await walletClient.sendTransaction(request);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
const buy = verifyBuyReceipt(receipt, deployment.contracts.launchpad, { token });
```

Builders return `{ to, data, value }`. Consumers remain responsible for wallet selection, simulation,
gas estimation, submission, confirmation depth, and reorg policy.

Before enabling writes, prove that the selected RPC serves the deployment described by the SDK:

```ts
import { assertCompatibleDeployment } from "@reptilianhq/launch-on-block-sdk/compatibility";
import { robinhoodMainnet } from "@reptilianhq/launch-on-block-sdk/deployments";

await assertCompatibleDeployment(publicClient, robinhoodMainnet);
```

Compatibility checks prove deployment identity and wiring. They do not prove current operational health,
pause state, balances, finality, or external governance safety.

Read a launch escrow for reconciliation without importing its raw ABI:

```ts
import { readLaunchEscrowState } from "@reptilianhq/launch-on-block-sdk/escrows";
import { robinhoodMainnet } from "@reptilianhq/launch-on-block-sdk/deployments";

const escrow = await readLaunchEscrowState(publicClient, robinhoodMainnet, token);
if (escrow.status === "deployed") {
  console.log(escrow.backing); // Raw accounting value; do not present as TVL or price.
}
```

SDK validation errors expose stable codes:

```ts
import { isSdkError } from "@reptilianhq/launch-on-block-sdk/errors";

try {
  verifyCurveBuyTransaction(transaction, launchpad, account, expectedBuy);
} catch (error) {
  if (isSdkError(error) && error.code === "CALLDATA_MISMATCH") {
    // Map application behavior by code; messages may evolve.
  }
  throw error;
}
```

## Development

Consumers require Node.js 22 or newer. Repository development and release automation use Node.js 24
with npm and the committed lockfile.

```sh
npm ci
npm test
```

`npm test` verifies the reviewed artifact hashes, builds the package, runs the unit suite, and packs the
exact public exports from a clean `dist` directory. `npm run generate:indexing` regenerates every
committed indexing artifact from the built SDK catalog; normal checks fail on any drift.

Do not import Foundry artifact JSON or copy ABI fragments into consumer applications. Foundry artifacts
contain deployment bytecode and compiler metadata that application bundles do not need, while copied
fragments drift independently from the SDK's compatibility checks.

## Contract interface boundary

The private Launch On Block repository remains authoritative for deployment scripts and production
activation. This repository contains only the reviewed public SDK boundary: ABI subsets, deployment
metadata, deterministic builders, and verification helpers. It does not contain full contract source,
deployment tooling, credentials, or private infrastructure.

This repository never reads a sibling contract checkout during build or release. The initial generated
inputs are committed, hash-pinned, reviewed here, and published as part of the SDK release. Contract
sources can move here later without changing the established public boundary.

## License

Apache-2.0. Proprietary and open-source applications may use the SDK without relicensing their own
code. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Releases through `0.5.0` remain available under
their original GPL-3.0-only terms; Apache-2.0 applies beginning with `0.6.0`.
