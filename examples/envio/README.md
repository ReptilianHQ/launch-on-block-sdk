# Envio starter

This example stores one immutable decoded entity per public event and dynamically registers launch
tokens and graduation pools. It is generated from the SDK catalog.

1. Copy this directory together with the repository's `indexing/` directory, preserving their relative
   paths.
2. Set `ENVIO_ROBINHOOD_MAINNET_RPC_URL` and `ENVIO_ROBINHOOD_TESTNET_RPC_URL` to archive-capable
   endpoints, then add your confirmation/reorg policy to `config.yaml`.
3. Use Node.js 22, then run `npm ci --ignore-scripts && npm run check` and `npm start`.

The schema is deliberately event-shaped. Build pricing, liquidity, valuation, and application read
models separately so raw protocol amounts are never silently presented as priced values.

`envio` is development-only tooling. Run this starter in a local or disposable environment, process
only trusted configuration and generated inputs, and do not expose its development server or deploy
the starter as an application service. The lockfile is intentionally retained so upstream CLI
advisories remain visible and reproducible; CI gates the example's production dependency surface with
`npm audit --omit=dev` while Dependabot continues to track the complete toolchain.
