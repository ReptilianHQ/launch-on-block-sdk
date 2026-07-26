# Contract artifact handoff

The Launch On Block contract repository owns Solidity source, deployment scripts, and production
activation. This repository owns the public SDK assembled from reviewed contract outputs.

The boundary is a versioned JSON manifest conforming to
[`schemas/contract-artifact-handoff.schema.json`](../schemas/contract-artifact-handoff.schema.json).
Every public handoff identifies an opaque producer authority, release, chain, deployment, ABI revision,
and the SHA-256 digest of every transferred file. Every schema-v2 handoff is signed with an Ed25519
key explicitly trusted for that opaque authority. Private repository coordinates, internal revisions,
secrets, and RPC endpoints are forbidden.

## Promotion flow

1. The internal contract authority builds and verifies an exact source revision.
2. Its release workflow exports the narrow generated ABI and deployment modules used by the SDK.
3. The producer embeds those exact bytes and their SHA-256 hashes in one immutable, signed release asset.
4. An authorized operator obtains that asset and runs
   `npm run artifacts:import -- --manifest <path>` on a branch in this repository.
5. A pull request reviews the generated inputs and provenance record. The producer has no write token for
   this repository.
6. CI runs `npm test`, including artifact hashes, TypeScript tests, build, and packed-export checks.
   For schema-v2 provenance it reconstructs the signed payload from committed bytes and re-verifies the
   producer signature; schema v1 is pinned to the exact bootstrap record and cannot be updated.
7. A separate SDK release publishes the reviewed package. Contract activation never publishes directly
   into a consumer repository.

Imports are fail-closed until an operator adds the producer's public key and stable key ID to
`config/artifact-authorities.json` in a reviewed change. Private keys never enter this repository.

The current provenance record documents public contract inputs without disclosing internal producer
coordinates. Future updates must use the handoff schema rather than copying files manually.
