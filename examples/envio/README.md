# Envio starter

This generated starter stores a canonical `LobProtocolEvent` log plus `LobLaunch`
and `LobPool` identity/terms read models. Edit the SDK catalog and regenerate,
not the generated schema or handlers. BigInt payload values are decimal strings; safe small integers remain JSON numbers.
Envio rolls back orphan log rows and materialized records together.

1. Copy this directory together with the repository's `indexing/` directory, preserving their relative
   paths.
2. Set `ENVIO_ROBINHOOD_MAINNET_RPC_URL` and `ENVIO_ROBINHOOD_TESTNET_RPC_URL` to archive-capable
   endpoints, then add your confirmation/reorg policy to `config.yaml`.
3. Use Node.js 22, then run `npm ci --ignore-scripts && npm run check` and `npm start`.

The previous per-event schema requires a fresh replay into a new database/schema.
See [the migration and acceptance guide](../../docs/INDEXING.md) before switching
consumers. Partial launch fields remain null until their evidence arrives;
conflicting immutable terms fail the handler. Pool identity does not imply
available reserves or prices. Envio loads handlers from the `src` directory;
`handlers` is a directory setting, not a TypeScript filename.

`envio` is development-only tooling. Run this starter in a local or disposable environment, process
only trusted configuration and generated inputs, and do not expose its development server or deploy
the starter as an application service. The lockfile is intentionally retained for a reproducible
audited dependency surface. CI gates the example's production dependencies with `npm audit --omit=dev`,
reports the complete toolchain audit without blocking on upstream CLI findings, and leaves Dependabot
enabled for maintainer tracking.
