# Follow-up audit evidence

Observed on 2026-09-08 starting at 16:34:01 UTC with Node 24.18.0, npm 11.16.0,
and viem 2.55.10. The SDK source was `f55db7d`; the checkout was PR head
`f81bc15385465d8d7448bdf222ad25c1e7e376c1` plus the report/probe changes in this commit.
These are new observations, not the original author's missing 269-call bundle.

## Live results

| Check | Mainnet 4663 | Testnet 46630 |
| --- | --- | --- |
| Latest block sampled | 57,836,408 | 115,679,126 |
| Safe block sampled | 57,829,437 | 115,673,102 |
| Safe lag | 6,971 blocks | 6,024 blocks |
| Launchpad code at safe | Error: `metadata is not found` | Pass |
| Launchpad code at latest minus 6,000 | Pass | Pass |
| Launchpad code at latest minus 7,000 | Error: `metadata is not found` | Error: `metadata is not found` |
| SDK compatibility, default safe | Error: `metadata is not found` | Pass |
| SDK compatibility, explicit latest minus 50 | Pass | Pass |
| Historical Launchpad logs, start through start + 16 | Pass, 3 logs | Pass, 3 logs |

This reproduces F-01's failure mode on mainnet at this observation time. It does
not establish a permanent retention threshold, future availability, or a
confirmation policy for consumers. The explicit recent block is diagnostic only.
The successful historical log requests disprove using state-read failure alone
as evidence that logs are unavailable. Full Envio backfill was not tested.

The successful compatibility report also records testnet
`proxyUpgradeGateTimelock` and `launchpadGovernance`, allowing F-03's live pointer
comparison to be checked. This probe does not check old testnet contract history,
fixture receipts, vanity predictions, fee constants, license/registry history,
the exact documentation coverage count, or every original audit claim.

## Reproduce and inspect

```sh
npm ci
npm test
node docs/audit-2026-09-08/probe.mjs > /tmp/launch-on-block-audit.jsonl
gzip -dc docs/audit-2026-09-08/rpc-evidence.jsonl.gz > /tmp/launch-on-block-attached.jsonl
```

[`probe.mjs`](probe.mjs) uses only the SDK's canonical public endpoints and
read-only JSON-RPC. [`rpc-evidence.jsonl.gz`](rpc-evidence.jsonl.gz) contains 143
RPC request/response records, plus run metadata and check summaries. Each RPC
record includes its timestamp, chain ID, ID, method, parameters, and complete
response or transport error. Concurrent requests can complete out of ID order.
Check errors are intentionally recorded without aborting the remaining checks;
an exit code of zero does not mean compatibility passed.

Uncompressed evidence SHA-256:
`5598cf6e28511e44a1a415335ba3680846c7b0421421acb515e03c40b61b4a53`.

## Local validation

`npm ci` completed, then `npm test` passed: artifact verification, build, public
boundary, indexing, conformance, script tests, 84 unit tests, and package checks
covering 31 leaf export targets, publint, and attw. Output is attached in
[`validation.txt`](validation.txt). This does not assert that GitHub CI ran;
the PR's initial CI run reported `action_required`.

No runtime, release-gate policy, package export, or immutable deployment artifact
was changed. This audit does not introduce an operational workflow requiring a
workflow registry entry. A useful follow-up is to make timestamped RPC evidence
capture a standard part of future deployment audits, with an explicit scope and
without changing the safe-block verification policy.
