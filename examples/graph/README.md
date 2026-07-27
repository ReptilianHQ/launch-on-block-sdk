# The Graph starter

This example stores every decoded public event parameter in immutable entities and registers dynamic
launch-token and graduation-pool data sources. Mainnet and testnet share one schema and mapping source.

1. Copy this directory together with the repository's `indexing/` directory, preserving their relative
   paths.
2. Configure the Robinhood network aliases from `networks.json` in your Graph Node.
3. Run `npm ci && npm run codegen:mainnet && npm run build:mainnet` (or the testnet variants).

The discovery events are the authoritative initial records. A dynamic template created while handling
an event may not replay earlier logs emitted by that new contract in the same transaction.
