# Envio starter

This example stores one immutable decoded entity per public event and dynamically registers launch
tokens and graduation pools. It is generated from the SDK catalog.

1. Copy this directory together with the repository's `indexing/` directory, preserving their relative
   paths.
2. Add your Robinhood RPC configuration and confirmation/reorg policy to `config.yaml`.
3. Run `npm install && npm run codegen`, then `npm start`.

The schema is deliberately event-shaped. Build pricing, liquidity, valuation, and application read
models separately so raw protocol amounts are never silently presented as priced values.
