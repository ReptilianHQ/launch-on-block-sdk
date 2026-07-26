# Contract artifact handoff

The Launch On Block contract repository owns Solidity source, deployment scripts, and production
activation. This repository owns the public SDK assembled from reviewed contract outputs.

The boundary is a versioned JSON manifest conforming to
[`schemas/contract-artifact-handoff.schema.json`](../schemas/contract-artifact-handoff.schema.json).
Every public handoff identifies an opaque producer authority, release, chain, deployment, ABI revision,
and the SHA-256 digest of every transferred file. Private repository coordinates, internal revisions,
secrets, and RPC endpoints are forbidden.

## Promotion flow

1. The contract repository builds and verifies an exact source commit.
2. Its release workflow exports the narrow ABI subsets and deployment metadata used by the SDK.
3. The producer creates a handoff manifest and publishes both inputs as immutable release assets.
4. A pull request updates this repository's generated inputs and provenance record.
5. CI runs `npm test`, including artifact hashes, TypeScript tests, build, and packed-export checks.
6. A separate SDK release publishes the reviewed package. Contract activation never publishes directly
   into a consumer repository.

The current provenance record documents the public contract inputs without disclosing private producer
coordinates. Future updates must use the handoff schema rather than copying files manually.
