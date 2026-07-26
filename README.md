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
- Stable SDK error codes and deterministic protocol arithmetic.

## Installation

The successor package is `@reptilianhq/launch-on-block-sdk`. Registry publication will be enabled only
after the public package namespace and release ceremony are configured. Until then, repository checks
produce a complete npm tarball that consumers can evaluate without publishing it.

Version `0.4.0` establishes the initial public package API in this dedicated repository.

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

`npm test` verifies the imported artifact hashes, builds the package, runs the unit suite, and packs the
exact public exports from a clean `dist` directory.

Do not import Foundry artifact JSON or copy ABI fragments into consumer applications. Foundry artifacts
contain deployment bytecode and compiler metadata that application bundles do not need, while copied
fragments drift independently from the SDK's compatibility checks.

## Contract artifact boundary

The Launch On Block contract repository remains authoritative for Solidity source, deployment scripts,
and production activation. It exports reviewed ABI and deployment inputs through the handoff documented
in [`docs/ARTIFACT_HANDOFF.md`](docs/ARTIFACT_HANDOFF.md).

This repository never reads a sibling contract checkout during build or release. Generated inputs are
committed, hash-bound to their producer identity, reviewed here, and then published as part of an SDK
release.

## License

GPL-3.0-only. See [`LICENSE`](LICENSE).
