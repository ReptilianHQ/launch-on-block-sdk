# Indexing integration handoff

Use `@reptilianhq/launch-on-block-sdk/indexing` for the typed event catalog and
`getIndexingManifest(chainId)`. The npm package also contains
`@reptilianhq/launch-on-block-sdk/indexing/manifest.json` and the exact event ABI
exports listed in [the artifact guide](../indexing/README.md). Pin the package
version and record the manifest's chain ID, deployment ID, release ID, ABI
revision, and schema version with your database. Repository examples may be
newer than the published package; the recovery example below is unreleased.

The current coverage is `public_integration_events`: Launchpad, Router,
FeeController, LaunchToken, and GraduationPool. It does not promise every
administrative contract or dependency event. The generated Envio and The Graph
starters are starting points. They have not been validated here by running a
complete hosted backfill, restart, or live reorg. In particular, the current
Envio starter has not yet adopted the shared SDK standard's normalized event
log and owner-declared materialized entities. CI does compile the exact-pinned
Envio and The Graph starters; that checks generated code, not live indexing.
The standard's aggregate/release indexing-check wiring also remains pending.

## Sources and discovery

Start fixed subscriptions at the manifest's `startBlock`, not today's head or
the compatibility probe's reviewed block. For the current manifest, mainnet
4663 starts at 17957183 and testnet 46630 at 92793378. Read addresses and block
bounds from the manifest; never mix chain deployments. Transaction compatibility
review bounds are not a reason to truncate historical discovery. This release
is not a catalog of all historical protocol generations.

| Source | Registration evidence | Processing boundary |
| --- | --- | --- |
| Launchpad, Router, FeeController | Fixed manifest addresses | Replay supported history from `startBlock` |
| LaunchToken | Known Launchpad's `LaunchCreated.token` | Include the discovery transaction's earlier token logs |
| GraduationPool | Known Launchpad's `Graduated.pool` | Include supported pool logs in the discovery transaction |

A matching topic from an arbitrary emitter is insufficient registration evidence.
Fetch the complete discovery transaction receipt and process registration before
decoding its dynamic-source logs, or prove your framework provides equivalent
coverage. The pinned launch receipt in this repository has `Transfer` at log
indices 15 and 16, before `LaunchCreated` at 17. Starting after registration
would omit those transfers. Confirm your framework's registration, block replay,
and duplicate handling on this receipt before relying on the starter.

## Event meaning and correlation

Order by block number, transaction index, then log index. Preserve chain ID,
block hash, transaction hash, emitter, signature, and decoded arguments. Obtain
block timestamps from the matching block hash when needed. Serialize `bigint`
amounts as decimal strings; JavaScript `number` loses precision.

- `LaunchCreated` establishes token identity and creator payout terms;
  `CurveSelected` supplies curve identity and quote target. Join by token.
- `Buy` and `Sell` are curve trades. `Graduated` links a launch token to its
  graduation pool and reports the allocation at graduation.
- Router `Swap` and underlying curve/pool events can describe the same routed
  operation. Correlate by transaction and protocol identities before computing
  volume; do not count every emitted trade event as a separate user trade.
- `FeesCollected` reports the fee split; `ProtocolFeesCollected` reports a pool
  collection. These are distinct evidence, not two independent revenue totals.
- Token `Transfer` includes mint and burn; `Approval` is allowance evidence.
  The sampled receipts alone cannot reconstruct total supply or balances.

Consult each catalog parameter's `semantic`. Native quote amounts and launch
amounts remain raw integers; pool `amount0`/`amount1` refer to token0/token1.
Resolve pool assets and decimals from reviewed reads with block provenance
before computing prices. The event-only pool ABI does not supply those reads.
Metadata URIs are untrusted external content: store the URI as evidence and keep
any fetching and rendering policy in the host.

## Recovery example and acceptance evidence

From a checkout with Node 24 and the committed npm lockfile:

```sh
npm ci
npm run build
npm run test:indexing
```

[`examples/indexing/replay.mjs`](../examples/indexing/replay.mjs) is an offline,
bounded receipt journal, not a production indexer or public SDK export. Its
[test](../examples/indexing/replay.node-test.mjs) runs in `npm test` and demonstrates:

- registration before decoding the entire discovery receipt;
- exact duplicate ingestion and JSON snapshot/restart equivalence;
- chain/deployment/release/ABI binding and lossless integer payloads;
- explicit rollback removing both orphaned event rows and discovered sources;
- rejection of conflicting receipts, bad provenance, and malformed known events.

The [five captured receipts](../fixtures/indexing-receipts.json) were fetched
from the named public RPC and cross-checked against the existing pinned fixture's
transaction identity, block number, and raw logs. The fixture records capture
time and provider. Maintainers can explicitly refresh it with
`node scripts/capture-indexing-receipts.mjs`; tests never access the network.
These are selected, non-contiguous transactions. The test yields 13 supported
rows, not a complete chain history. Unknown dynamic sources remain unknown
without their discovery history. The replacement block in the rollback test is
synthetic; it is not evidence of an observed chain reorg.

The example recomputes state from its journal, so it is deliberately unsuitable
for an unbounded backfill. It records no block timestamp or materialized domain
entities and does not establish full Envio-standard conformance. Its checkpoint
is the last processed **receipt**, not a claim that a block is complete. Resume
at that block and deduplicate; never skip to the next block based on it alone.
Exact duplicate receipts must have the same representation; normalize provider
responses before durable ingestion if providers format them differently.

## Host responsibilities before production

Persist canonical logs, discovered sources, derived entities, and the durable
checkpoint atomically. Keep enough block ancestry to identify a common ancestor.
On a reorg, remove orphan rows and discoveries and roll back derived entities
before replaying the replacement branch. The example's `rollbackTo(blockHash)`
retains every already-journaled receipt at that observed block; the host must
first establish that the anchor is canonical. A snapshot is a trusted local
record, not cryptographic receipt or ancestry proof.

Choose and document a confirmation/finality policy separately from decoding.
`verify*Receipt` validates supplied receipt evidence. Waiting for inclusion or
receiving a successful verification result does not independently establish
chain finality. See [verification guarantees](QUICKSTART.md).

Test the intended provider's historical log and receipt retention, practical
block-range/response limits, pagination completeness, retry behavior, and
available finality tags. Persist progress only after a complete requested range;
adapt range size and retry reads without silently skipping failures. The SDK
audit's dated RPC observations do not certify an indexing provider or historical
log availability: see [audit scope](DOCS_AUDIT_2026-09-08.md).

Before serving consumers, run your chosen framework against the pinned discovery
receipt, compare a bounded backfill with independent receipt/log results, restart
from durable state, redeliver duplicates, and exercise rollback in a controlled
fixture. Record chain/deployment, package and framework versions, provider,
range, counts, and expected results. A passing offline suite is evidence for its
listed cases, not a substitute for these deployment checks.
