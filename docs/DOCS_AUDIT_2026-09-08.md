# Documentation audit — 2026-09-08

**Original audit scope:** every `.md` in this repository plus the TSDoc in `src/*.ts`, checked against (a) the source and build outputs at HEAD `f55db7d` (v0.9.0 + 1 commit) and (b) the live Launch On Block deployment on Robinhood Chain mainnet (4663) and testnet (46630), using the canonical `rpc_url`s the SDK ships.
**Change policy:** audit documentation and read-only reproduction evidence only. No SDK runtime, deployment input, release gate, or package exports changed.
**Original author-reported method:** a 125-claim ledger and 269 JSON-RPC calls. That original ledger, log, and probe bundle were not attached to this PR. Original live-chain observations, counts, and coverage totals below are author-reported, not independently verified by the report itself. The attached follow-up probe and evidence cover only the explicitly listed checks; they do not reconstruct the missing original bundle.

**Follow-up remediation:** F-01 now has documented block selection, bounded safe-only retries in the
verification command, and an actionable provider-state failure. F-02/F-03 are superseded for repository
metadata use by an evidence-bound [correction record](DEPLOYMENT_METADATA.md), checked for both networks
without rewriting the immutable producer artifact. The findings below describe the original audited
revision; published deployment identities remain unchanged.

## Verdict

**Original audit verdict: mostly accurate, subject to the missing evidence described above.** All 26 contract addresses, all 26 runtime code hashes, both chain ids, both start blocks, the EIP-1967 proxy wiring, release id `gen-12`, the ABI revision, all 5 pinned mainnet transactions, all 8 `verify*Receipt` evidence objects, the CREATE2 vanity init code, the fee/curve constants, the `exports` map, the license history and the npm withdrawal history were reported to match source, the npm registry, GitHub tags, and live chain state. `npm test` is green (84 unit + scripts + pack); `assertCompatibleDeployment` was reported to pass on both chains when state was available. The follow-up reproduced the default-safe mainnet failure; see the attached evidence.

The principal findings concern RPC state availability, stale internal metadata, and documentation access. One is a live behaviour the docs don't warn about (F-01), one is stale data inside a file the README calls "reviewed provenance" (F-02/F-03), and one is a dead link (F-04). The rest is incompleteness: most of the public API surface is undocumented (§3).

## 1. Stale / wrong

| id | severity | where | docs say | actually |
|---|---|---|---|---|
| **F-01** | **blocks-integrator (intermittent)** | `README.md` (compatibility example and escrow paragraph); `src/compatibility.ts`; `src/escrows.ts` | Snippet is the pre-write gate to run against "the selected RPC". The compatibility snippet omits the read-block policy; the escrow paragraph already says "one numbered safe block" and its TSDoc also states the safe-block policy. The RPC retention caveat and explicit block-number example are missing. | Both functions default to `getBlock({ blockTag: "safe" })` and then read code/storage at that height. The original author reported a limited historical-state window on the canonical mainnet RPC (`rpc.mainnet.chain.robinhood.com`, reported Nitro v3.11.4): roughly the most recent ~6,000–7,000 blocks at observation time (`latest-6000` OK, `latest-7000` → `metadata is not found`). When the `safe` tag lags `latest` by more than that window, the README snippet and `scripts/verify-deployment.mjs` fail with `-32000 metadata is not found`. Observed during this audit: safe lag 7,383 → 3 consecutive failures; ~40 min later safe lag 4,772 → pass. The original author reported passing samples with `{ blockNumber: latest - 50n }`. This is a diagnostic block selection, not a safe/finalized guarantee or recommended automatic fallback. The `options.blockNumber` escape hatch is undocumented. |
| **F-02** | misleading | `src/generated/deployments.ts` (testnet `chain_data`); `README.md` ("immutable generated deployment input preserves reviewed provenance"); `AGENTS.md` | The committed generated input is reviewed and consistent for every published deployment. | Testnet `chain_data` pins `deployment_id "46630:launchpad:0x6993320e…:91383760"` / launchpad `0x6993320E…` / start `91383760`, while the `contracts` block in the same file — the one actually exported — pins `0x9fe4f17b…` at `92793378`. `0x6993320E…` is live code (22,759 B) but a **previous-generation testnet launchpad**: lacks `DEFAULT_CURVE_ID`/`curveCount`/`graduationPoolDeployer`/`launchEscrowDeployer` (all revert), own FeeController `0x39e5b82f…` (created at block 91383760 — the stale start block), 6 launches, last event at 91,975,020. `0x9fe4f17b…` is gen-12: created 92793386, hash matches manifest, compat PASS. `sanitize-built-deployments.mjs` strips `chain_data` from `dist/`, so **npm consumers never see it** — but `provenance/current.json` identifies only mainnet semantically. Its artifact hash covers the entire generated file, including testnet; the verifier detects byte changes but does not reject this already-pinned internal inconsistency. |
| **F-03** | cosmetic (internal) | `src/generated/deployments.ts` (testnet `release_authorities.timelock`) | `0xf3fcb520…`, `delay_seconds: 0` | Testnet proxy-upgrade gate `timelock()` returns `0x42325262…` (= `launchpad.governance()`). `0xf3fcb520…` is the **mainnet Router** address — copy-paste. Mainnet timelock entry is correct (`getMinDelay()`=3600). Stripped from npm. |
| **F-04** | misleading | `README.md` | Link to `github.com/ReptilianHQ/reptilian/blob/main/docs/SDK_STANDARDS.md` "for the shared standard … and its dated conformance table". | Repo is not publicly reachable (404 unauthenticated). A public reader cannot see the standard, the conformance table, or the canonical script whose sha256 (`e03bec3e…`) heads `scripts/check-conformance.mjs`. |
| F-05 | misleading | `README.md` | Receipt verification "tied to the expected contract **and transaction envelope**". | `verify*Receipt` (`receipts.ts`) matches emitter address + decoded event fields only. Envelope checks live in the separate `verify*Transaction` family, which takes a `ConfirmedTransactionLike`, not a receipt; no shared hash links the two. |
| F-06 | cosmetic | `README.md` | `npm test` "verifies the reviewed artifact hashes, builds the package, runs the unit suite, and packs". | `check` also runs `check:public`, `check:indexing`, `check:conformance`, `test:scripts` (`package.json`). |
| F-07 | cosmetic | `README.md` | `readLaunchEscrowState` "verifies … deployed bytecode". | Verifies bytecode is **non-empty** (`escrows.ts`); no hash comparison. |
| F-08 | cosmetic | `fixtures/robinhood-mainnet.json` | `"deploymentId": "robinhood-chain-mainnet"` | Every other surface uses `4663:launchpad:0x135492…:17957183` for `deploymentId`; the fixture stores a network id under that key. |
| F-09 | cosmetic | `README.md` | Vanity "regression vector is checked against the production Launchpad". | `vanity.test.ts` compares to a hard-coded constant; no RPC. (The init code was independently confirmed here: predicting from the live `createLaunchVanity` calldata of tx `0xff48909c…` yields the real token `0x0148B4eF…`.) |
| F-10 | cosmetic | `examples/envio/README.md`; `.github/workflows/ci.yml` | "archive-capable endpoints" | The example asks users for archive-capable endpoints, while CI supplies canonical URLs only for codegen/typechecking. F-01 concerns historical state; it does not establish whether historical `eth_getLogs` requests or an Envio backfill fail. Full backfill capability remains unverified. A bounded log probe is included below. |

No documented file path, npm script, or command is missing. `CHANGELOG.md` `0.9.0` matches `package.json` and the npm registry; `Unreleased` correctly reflects HEAD being one commit past `v0.9.0`.

## 2. Chain verification summary

Original author-reported observations using the shipped RPCs. The referenced original `chain-evidence.md` was not supplied. See the attached follow-up evidence for independently rerun checks and their narrower scope.

**Mainnet 4663** — 63 checks PASS, 2 FAIL (both F-01), 1 noted.
`eth_chainId`=0x1237 ✔ · `eth_getCode` non-empty 15/15 ✔ · keccak(code) == `runtime_code_hashes` 13/13 ✔ · EIP-1967 impl/admin slots ✔ · Launchpad views (`DEFAULT_CURVE_ID`=1, `MIN_CURVE_FEE_BPS`=50, `MAX_CURVE_FEE_BPS`=500, `maxGraduationCutBps`=500, `protocolCutBps`=200, `curveCount`=1, `allLaunchesLength`=17, `raiseThreshold`=4.16 ETH, all pointers == manifest, `governance`=`0x4047d08f…`) ✔ · Router/FeeController/escrowDeployer/gate/admin pointers ✔ · Launchpad created in exactly `start_block` 17957183 (tx `0x64a0b523…`), 0 Launchpad/Router logs before it ✔ · first `LaunchCreated` = block 18,582,638 = fixture tx `0xff48909c…` ✔ · 5/5 fixture receipts byte-identical ✔ · 8/8 `verify*Receipt` on live receipts ✔ · CREATE2 regression ✔ · `assertCompatibleDeployment` default (`safe`) ✘ intermittent (F-01), at explicit block ✔ · `readLaunchEscrowState` ×3 fixture tokens at explicit block ✔ · explorer resolves ✔.
Noted: FeeController has 3 proxy-lifecycle logs (`Initialized`, `Upgraded`, `AdminChanged`) at 17956952, before `start_block`. Not catalogue events; harmless for indexers.

**Testnet 46630** — 40 checks PASS, 0 FAIL on the published projection; 2 stale values in the unpublished raw input (F-02, F-03).
`eth_chainId`=0xb626 ✔ · code + hash 14/14 ✔ · EIP-1967 ✔ · Launchpad views (same constants; `raiseThreshold`=0.416 ETH; `allLaunchesLength`=1) ✔ · pointers ✔ · `start_block` 92793378 = proxy-gate creation, Launchpad at 92793386, 0 logs before start ✔ · `assertCompatibleDeployment` default ✔ (safe lag inside window at audit time) · explorer resolves ✔.

## 3. Missing coverage (correct but undocumented)

The original author reports importing every `package.json` export target and comparing named exports against documentation. The missing consumer-import script and ledger prevent independent verification of these exact totals. Treat the counts below as original audit claims, not a reproduced inventory.

- **Subpaths never named in any doc:** `./economics`, `./transactions`, `./receipts`, `./vanity`; `./indexing/manifest.schema.json`; `./indexing/abis/{Router,FeeController,LaunchToken,GraduationPool}.events.json`. The package has 20 export-map entries; the follow-up pack check validates 31 leaf export targets (including separate type/import targets).
- **62 of 74 root exports never named in any doc**, including: `getChain`, `listChains`, `robinhoodTestnet`, all `ROBINHOOD_*` constants; `routerAbi`, `feeControllerAbi`, `graduationPoolAbi`, `lbFactoryIdentityAbi`, `lbRouterIdentityAbi`, `abiSignatures`, `ABI_REVISION`; the entire `economics` module; `buildCurveSell/Graduate/Claim/Approve/RouterBuy/RouterSell/SwapExactIn/CollectFees` transaction builders, `toRpcTransactionRequest`, `parseRpcTransactionRequest`, `decodeLaunchpadTransaction`, `decodeRouterTransaction`, 10 of 11 `verify*Transaction`; 8 `verify*Receipt` functions + `assertSuccessfulReceipt`; `DeploymentCompatibilityError`, the `DeploymentCompatibilityReport` shape, the `options.blockNumber` parameter; `listIndexingManifests`; `predictLaunchTokenAddress`, `LAUNCH_TOKEN_TOTAL_SUPPLY`, `startSalt`; 25 of 26 `SdkErrorCode` values and `SdkError`'s `path/expected/actual/toJSON`.
- **Undocumented behaviour:** `buildClaimTransaction` selects `claim()` vs `claimAll(token)` (`transactions.ts`); `buildCollectFeesTransaction` `"amm" | "lb"` venue switch (`transactions.ts`); `verifyBuyReceipt` `minTokensOut` / `OUTPUT_BELOW_MINIMUM`.
- **Undocumented requirements:** viem peer range `>=2.21.0 <3` (`package.json`); `npm run verify:deployment` with `SDK_RELEASE_CHAIN_ID` / `VERIFY_RPC`.
- **Live protocol constants the docs never state** (all confirmed on both chains): `MIN_CURVE_FEE_BPS`=50, `MAX_CURVE_FEE_BPS`=500, `maxGraduationCutBps`=500, `protocolCutBps`=200, `DEFAULT_CURVE_ID`=1, `raiseThreshold` 4.16 ETH mainnet / 0.416 ETH testnet, launch supply 1e27.
- `start_block` means different things per chain (mainnet = Launchpad creation; testnet = first gen-12 contract, 8 blocks before the Launchpad). "Deployment boundary" is never defined.
- `README.md` says consumers own confirmation depth and reorg policy; the SDK defaults to `safe` for its own reads; the escrow section documents this, but the compatibility example and RPC availability caveat need clarification (F-01).

## 4. Original audit limitations (author-reported)

| item | why |
|---|---|
| `economics.ts` "deadline equal to current timestamp remains valid on-chain" | Router source private; not deterministically testable via `eth_call`. |
| `docs/RELICENSING.md` `git shortlog` authorship audit | Shallow clone. |
| `docs/RELEASING.md` npm trusted-publisher claims | npm-side settings/attestations not fetched; 0.4.x withdrawn. |
| `envio codegen` / `graph codegen` run instructions | Toolchains not installed; scripts exist and are wired. |
| `vanity.test.ts` oracle address provenance | No public `predict` view; init code validated via the real-token regression instead. |
| Whether the mainnet `safe` lag exceeding the state window is chronic | Observed for ~25 min, then cleared. Intermittent at minimum. |
| Blockscout REST cross-check | 403 (Cloudflare) from the audit environment; RPC used instead. |

## 5. Recommended maintainer actions (none applied here)

1. `src/generated/deployments.ts` — regenerate or drop the testnet `chain_data` block (`0x6993320e…` / 91383760 → `0x9fe4f17b…` / 92793378 or remove). Update the testnet timelock in that file → what the chain reports. This is a separate deployment-authority review: do not hand-edit the immutable input or merely re-hash it to bypass validation. Any replacement must carry reviewed provenance and corresponding verifier updates.
2. `provenance/current.json` — add semantic consistency validation for both networks alongside the existing whole-file hash check. Merely adding another deploymentId without checking it against the exported contract identity would not detect the inconsistency.
3. `README.md` — clarify the compatibility helper's default `safe` block and document that observed historical-state availability may be shorter than safe lag. Show `{ blockNumber }` with its confirmation-policy tradeoff. Preserve the release gate's safe-block policy: use an RPC that serves the required state or retry with an actionable error. An automatic `latest - N` fallback would change the verification guarantee and needs a separate policy decision.
4. `README.md` — make `SDK_STANDARDS.md` public, vendor the text, or drop the link.
5. `README.md` — state the viem peer range. `README.md` — add `verify:deployment` and the full `check` chain.
6. README API coverage — at minimum a table of the 11 subpaths and their exports, the 26 `SdkErrorCode` values, and the live protocol constants (§3).
7. Wording fixes per F-05 / F-06 / F-07 / F-09.
8. `fixtures/robinhood-mainnet.json` — optional re-pin (`finalizedObservedAt` 2026-09-05 / `pinnedAtBlock` 55251879; content still exact); rename `deploymentId` → `networkId` or use the canonical string (F-08).

## Reproduction and evidence boundaries

The original 269-call bundle remains unavailable. Its historical observations cannot be recovered by rerunning against today's moving chain head. The follow-up probe is committed at [`audit-2026-09-08/probe.mjs`](audit-2026-09-08/probe.mjs); results and validation are described in [`audit-2026-09-08/README.md`](audit-2026-09-08/README.md).

```sh
npm ci
npm test
node docs/audit-2026-09-08/probe.mjs > /tmp/launch-on-block-audit.jsonl
```

The probe records timestamps, chain IDs, request parameters, complete RPC responses/errors, latest/safe lag, code availability at sampled heights, a bounded historical log query, and SDK compatibility at default safe and explicit recent blocks on both chains. It makes no transactions. Its exit status is not a release verdict: inspect the `check` records for individual errors. A successful bounded log query is not a full Envio backfill test. A successful recent-block check does not provide safe/finalized guarantees.

The original standalone release checks remain reproducible with `node scripts/verify-deployment.mjs` and `SDK_RELEASE_CHAIN_ID=46630 node scripts/verify-deployment.mjs` after building. No automatic fallback has been added.
