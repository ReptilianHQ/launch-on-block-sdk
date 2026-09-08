# Deployment metadata corrections

`src/generated/deployments.ts` and `provenance/current.json` remain the exact,
hash-pinned producer inputs. They are historical evidence, not an authoritative
source for current operational governance. Do not edit them or change the
bootstrap hash to silence an inconsistency.

The original input's internal testnet `chain_data` names an earlier launchpad
and boundary, and its testnet timelock address is the mainnet Router. The
published `contracts` projection was already correct; these internal fields
are stripped from the npm artifact.

[`provenance/deployment-metadata.json`](../provenance/deployment-metadata.json)
is the corrected repository metadata record for the two published networks.
It supersedes the original input's `chain_data` identity and timelock address
for audit/tooling use. Other release-authority fields, including delay and Safe
owners, are not revalidated or made current by this correction. Consumers use
the package's public deployment/provenance exports, not this internal record.

| Testnet field | Original input | Corrected record |
| --- | --- | --- |
| Launchpad | `0x6993320E82Ac53F75eDA8a5051cE437c6F3584c5` | `0x9fe4f17b53a520c4c8672c945285574a7396340f` |
| Start block | `91383760` | `92793378` |
| Timelock | `0xf3fcb520def7473f0eeb473a73cade20a2eb1f4a` | `0x423252628908c6c6025190c5a026eb9bb99997f5` |

The corrected deployment ID is derived from chain ID, the published launchpad,
and the published start block. The boundary remains the earliest deployment
boundary in the manifest; it need not equal the Launchpad's creation height.

## Evidence and verification

The record binds the unchanged source artifact SHA-256 and the decompressed
SHA-256 of the [September 8 RPC evidence](audit-2026-09-08/README.md).
Timelock values match both `launchpadGovernance` and
`proxyUpgradeGateTimelock` in successful compatibility reports at the recorded
block on each network. Those recent-block observations establish values at
those blocks; they do not assert finality or current governance state.

`npm run check:artifacts` verifies:

- The original provenance and generated artifact hashes are unchanged.
- The correction record matches its reviewed hash and binds the source/evidence.
- Both network identities agree with the contracts used by the public projection.
- Each corrected timelock agrees with the matching chain, release, ABI revision,
  block, and two governance pointers in the evidence.

`npm test` runs these checks plus regression cases rejecting the stale testnet
identity, wrong boundaries, incorrect timelocks, missing evidence, and incomplete
network coverage. Builds remain offline and never read private upstream inputs.

## Future corrections

Record new evidence and review the correction record and its pinned hash
together. Preserve prior evidence and the immutable producer inputs. A new
contract release requires a separately reviewed producer artifact/provenance
update; this record cannot authorize a change to the public deployment identity.
Do not use it as a runtime source of administrative authority.

This repository has no workflow registry. The existing `check:artifacts` and
`npm test` commands are the verification boundary; this runbook documents the
manual evidence review without introducing a second workflow framework.
