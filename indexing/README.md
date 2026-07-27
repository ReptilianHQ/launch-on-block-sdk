# Launch On Block public indexing boundary

This directory is the stable, vendor-neutral indexing surface published with
`@reptilianhq/launch-on-block-sdk`. It contains the public integration events intentionally supported
for third-party consumers; it is not an inventory of every implementation or administrative event.

- `manifest.json`: chain identities, deployment boundaries, event topics, decoded parameters, value
  semantics, and dynamic source discovery.
- `manifest.schema.json`: complete JSON Schema for validating the manifest.
- `abis/*.events.json`: minimal event-only ABIs.

Use chain ID, block hash/number, transaction hash/index, log index, and emitter address as event
provenance. Handle reorgs and begin each fixed source at its declared start block. Dynamic sources begin
at `LaunchCreated.token` and `Graduated.pool`; initial lifecycle state belongs to those discovery
events because a newly registered source may not replay earlier logs from the same transaction.

Amounts are raw integers. Their `semantic` labels identify units, but pricing, decimal normalization,
valuation, attribution, confirmation policy, and storage design belong to the consumer.

Complete Envio and The Graph starters live in the repository's `examples/` directory. They are
generated and drift-checked, but intentionally are not part of the npm package API.
