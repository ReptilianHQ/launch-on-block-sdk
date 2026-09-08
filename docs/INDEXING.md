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
administrative contract or dependency event. The generated Envio starter now
uses one normalized `LobProtocolEvent` log and the catalog-defined `LobLaunch`
and `LobPool` read models. All events retain lossless JSON payloads and complete
chain/block/transaction provenance. The Graph remains an optional per-event
starter; it does not share the Envio schema migration.

Envio compilation, generator drift/behavior tests, packed exports, and the
vendored indexing conformance checker run in normal checks and before publishing.
The [live smoke evidence](envio-smoke-2026-09-08.json) proves a three-block public
RPC backfill and persisted PostgreSQL restart with Envio 3.2.1. It does not prove
a complete deployment backfill or acceptance on the integrating team's provider.

### Envio schema migration

Existing starter databases require a fresh replay into a new database/schema.
Do not point the new schema at production and reset it in place. Keep the old
indexer serving while replaying the new schema, compare the resulting bounded
history and consumer queries, then switch consumers explicitly.

`LobLaunch` joins `LaunchCreated`, `CurveSelected`, and `Graduated` by chain/token.
Fields absent from available evidence stay null; joins preserve fields from the
other events regardless of order. Conflicting immutable identity/terms fail the
handler. `LobPool` records only membership proven by `Graduated`; it does not
infer reserves or token ordering. These small read models deliberately avoid
volume counters, balances, or price calculations that need broader evidence.

Normalized event IDs contain chain ID, block hash and log index. Reorg rollback
must remove orphaned event rows and materialized updates together; Envio's
`rollback_on_reorg` setting is enabled. Fixture rollback is tested separately;
no live reorg is claimed by this smoke.

To reproduce the disposable Docker/Postgres smoke after installing the starter:

```sh
npm run check:envio-example
node scripts/smoke-envio.mjs /tmp/lob-envio-evidence.json
```

This command reads public mainnet blocks 18582638–18582640, creates only its own
localhost PostgreSQL container, compares all four discovery-transaction events,
restarts without resetting the database, and checks exact serialized state
identity. It removes its own container and temporary files on exit. It does not
connect to your application database or run during CI/release. Docker and its
`postgres:17-alpine` image are required. The smoke uses the invoking Node runtime;
the maintained starter's runtime recommendation remains Node 22. Envio's
[environment-variable reference](https://docs.envio.dev/docs/HyperIndex/environment-variables)
describes provider and local database configuration.

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
entities and is independent of the generated Envio conformance tests. Its checkpoint
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
