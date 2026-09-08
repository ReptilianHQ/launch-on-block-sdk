# Launch On Block SDK

[![CI](https://github.com/ReptilianHQ/launch-on-block-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/ReptilianHQ/launch-on-block-sdk/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40reptilianhq%2Flaunch-on-block-sdk)](https://www.npmjs.com/package/@reptilianhq/launch-on-block-sdk)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

Public TypeScript SDK, contract interfaces, ABIs, and deployment metadata for integrating with the
Launch On Block protocol on Robinhood Chain.

The package is runtime-neutral. It provides deterministic transaction requests and verification tools,
but it does not select a wallet, RPC provider, gas policy, nonce policy, application backend, or user
authorization model.

## What it provides

- Narrow, generated ABI subsets with literal `as const` types.
- Typed, chain-scoped deployment metadata and replay boundaries.
- Transaction builders and calldata verification.
- Receipt event verification against the expected emitter and supplied fields.
- Deployment compatibility checks for runtime bytecode, proxies, and cross-contract wiring.
- A machine-readable public event catalog with neutral assets and runnable Graph and Envio examples.
- Stable SDK error codes and deterministic protocol arithmetic.
- Offline LaunchToken CREATE2 prediction and bounded vanity-salt mining.
- Published `./provenance/mainnet.json` and `./provenance/testnet.json` deployment provenance
  documents, generated at build time from the same reviewed public deployment manifest that
  `./deployments` exports.

## ABI support boundary

The SDK publishes only interfaces that applications are expected to read or call directly:

- Launchpad, launch-token, Router, FeeController, and graduation-pool interfaces.
- Narrow LB factory and Router identity reads used to identify the configured liquidity venue.
- ABI revision and signature metadata for compatibility evidence.

Deployment verification also needs narrow interfaces for the launch-escrow deployer, proxy admin, and
proxy upgrade gate. Those interfaces are committed in the generated artifact and bundled with the SDK
because `assertCompatibleDeployment()` uses them internally, but they are not public package exports.
Consumers should call the compatibility helper instead of rebuilding governance and proxy checks.

The immutable generated deployment input preserves historical producer provenance. Its internal testnet
`chain_data` and timelock fields contain known stale values; repository tooling uses the evidence-bound
correction record in [`provenance/deployment-metadata.json`](https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/provenance/deployment-metadata.json).
`npm run check:artifacts` preserves the original hashes and checks corrected identities on both chains.
See the [metadata correction policy](https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/docs/DEPLOYMENT_METADATA.md).
The package exports only a
typed public projection; operational controls, release authorities, deployer identity, and private
chain evidence are excluded from declarations and the npm runtime artifact.

The raw launch-escrow ABI remains internal. Consumers that need protocol reconciliation can use
`readLaunchEscrowState()` from the `./escrows` export. It reads one numbered safe block, verifies the
Launchpad mapping, deterministic deployer prediction, non-empty bytecode, launchpad pointer, and token
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

Requires Node.js 22 or newer and `viem >=2.21.0 <3`. Install the public package from npm:

```sh
npm install @reptilianhq/launch-on-block-sdk 'viem@^2.21.0'
```

Releases use npm trusted publishing with provenance from the public GitHub repository and protected
release environment. See [`docs/RELEASING.md`](docs/RELEASING.md).

## Start here

Follow the [complete quickstart](https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/docs/QUICKSTART.md)
to create a client, verify the testnet deployment, and read fee terms without a wallet.
It includes a separately callable wallet-buy example that simulates, estimates gas, submits, and
verifies the mined transaction and receipt. Every variable and import is defined, and CI compiles
these examples against the packed SDK. Offline examples run during package validation.

The [API reference](https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/docs/API_REFERENCE.md)
covers every module, export, parameter/result type, error code, and verification boundary. Its
exact signatures and export inventory are generated from the built declarations and checked for drift.

Builders return `{ to, data, value }`. Consumers own quotes, wallet selection, simulation, gas,
submission, confirmation depth, and reorg policy. Transaction verifiers compare sender, target,
native value, and calldata. Receipt verifiers independently check successful status, emitter,
and supplied event fields. They do not verify a transaction envelope or automatically link two
observations; the wallet example demonstrates that association explicitly.

Compatibility and escrow reads default to one numbered `safe` block. An RPC may retain less
historical state than its safe lag requires; `metadata is not found` is an incomplete verification,
not a passed check. Use a provider serving the required state or retry later. Both helpers accept
`options.blockNumber` under the caller's confirmation policy. They do not silently fall back to
`latest`, and a recent block is not necessarily safe/finalized.

## Development

Consumers require Node.js 22 or newer. Repository development and release automation use Node.js 24
with npm and the committed lockfile.

```sh
npm ci
npm test
```

For a live safe-block compatibility check, run `npm run verify:deployment` (mainnet by default), or
`SDK_RELEASE_CHAIN_ID=46630 npm run verify:deployment` for testnet. `VERIFY_RPC` selects an alternate
endpoint. The command retries recognized unavailable-state errors up to three total attempts, two
seconds apart, selecting a safe block on each attempt. It exits nonzero if verification still cannot
complete and never switches to a recent block. Identity mismatches fail immediately.
See [release verification](https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/docs/RELEASING.md#live-deployment-verification)
for troubleshooting.

`npm test` verifies immutable artifacts and corrected metadata, builds the package, checks public
boundaries/indexing/conformance/docs, runs script and unit suites, and validates the packed exports.
The package check compiles consumer examples against the extracted tarball and runs the offline example. The resulting tarball must pass strict `publint` and
Are The Types Wrong checks for the SDK's supported ESM resolution modes. CI also audits GitHub Actions
and Dependabot configuration with a pinned `zizmor` action and scanner release. `npm run generate:indexing`
regenerates every committed indexing artifact from the built SDK catalog; normal checks fail on any drift.

The unit suite includes Hegel property-based invariants (`*.hegel.test.ts`) for every exported `build*`
transaction constructor, every `verify*Receipt` function, and every pure economic helper: construction
round trips through the pinned ABI, calldata-mismatch rejection on any single-byte perturbation, receipt
acceptance with evidence equality, per-field rejection classified by error code, and bounds/round-trip/
monotonicity properties for the economic math. `fixtures/robinhood-mainnet.json` pins one finalized
mainnet receipt per `verify*Receipt` function, replayed in `src/receipts.test.ts` — the property
suites prove the rejection logic, the pinned receipts prove the encoding against a transaction that
really happened. The public conformance implementation is
[`scripts/check-conformance.mjs`](https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/scripts/check-conformance.mjs).
Its header pins the rule-body hash and `test:scripts` detects edits. These checked-in rules and the
[API reference](https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/docs/API_REFERENCE.md)
are publicly accessible; consumers do not need access to the private standards repository.

For documentation changes, edit the guides and `examples/consumer/*.ts`, then run
`npm run generate:docs` and `npm test`. `npm run check:docs` detects stale generated signatures and
example snippets. It runs after the build in the normal check chain.

Do not import Foundry artifact JSON or copy ABI fragments into consumer applications. Foundry artifacts
contain broad deployment data that application bundles do not need, while copied fragments drift
independently from the SDK's compatibility checks. The narrow reviewed LaunchToken init code used by
the vanity helper is intentionally pinned inside the SDK because CREATE2 prediction includes that exact
bytecode; its regression test compares against a pinned production vector offline, without a live RPC call.

Contributions are welcome through focused issues and pull requests. See [`CONTRIBUTING.md`](CONTRIBUTING.md)
for the public boundary, verification commands, and security-reporting expectations.

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
code. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE). Historical tags through `0.5.0` retain their
original GPL-3.0-only terms; Apache-2.0 applies beginning with `0.6.0`. Superseded npm versions through
`0.6.0` were withdrawn after the public boundary was hardened. The ownership audit for the transition
is recorded in [`docs/RELICENSING.md`](docs/RELICENSING.md).
