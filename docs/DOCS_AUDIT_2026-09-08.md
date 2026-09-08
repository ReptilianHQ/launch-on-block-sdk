# Documentation audit — 2026-09-08

**Scope:** every `.md` in this repository plus the TSDoc in `src/*.ts`, checked against (a) the source and build outputs at HEAD `f55db7d` (v0.9.0 + 1 commit) and (b) the live Launch On Block deployment on Robinhood Chain mainnet (4663) and testnet (46630), using the canonical `rpc_url`s the SDK ships.
**Change policy:** this file only. No documentation was edited; findings below are for the maintainers to act on.
**Method:** 125-claim ledger extracted from the docs → each claim checked against source → each on-chain claim checked by JSON-RPC (269 calls, all logged with method/params/result and reproducible with the scripts referenced at the bottom).

## Verdict

**Mostly accurate. Nothing an integrator would consume from the published package is wrong.** All 26 contract addresses, all 26 runtime code hashes, both chain ids, both start blocks, the EIP-1967 proxy wiring, release id `gen-12`, the ABI revision, all 5 pinned mainnet transactions, all 8 `verify*Receipt` evidence objects, the CREATE2 vanity init code, the fee/curve constants, the `exports` map, the license history and the npm withdrawal history all match source, the npm registry, GitHub tags, and live chain state. `npm test` is green (84 unit + scripts + pack); `assertCompatibleDeployment` passes on both chains.

Three findings matter. One is a live behaviour the docs don't warn about (F-01), one is stale data inside a file the README calls "reviewed provenance" (F-02/F-03), and one is a dead link (F-04). The rest is incompleteness: most of the public API surface is undocumented (§3).

## 1. Stale / wrong

| id | severity | where | docs say | actually |
|---|---|---|---|---|
| **F-01** | **blocks-integrator (intermittent)** | `README.md:162-168` (`assertCompatibleDeployment` snippet), `:174-183` (`readLaunchEscrowState`), `:46-47`; `src/compatibility.ts:348`; `src/escrows.ts:203` | Snippet is the pre-write gate to run against "the selected RPC". No mention of which block it reads. | Both functions default to `getBlock({ blockTag: "safe" })` and then read code/storage at that height. The canonical mainnet RPC (`rpc.mainnet.chain.robinhood.com`, Nitro v3.11.4) is **non-archive** — it serves state for roughly the most recent ~6,000–7,000 blocks (`latest-6000` OK, `latest-7000` → `metadata is not found`). When the `safe` tag lags `latest` by more than that window, the README snippet and `scripts/verify-deployment.mjs` fail with `-32000 metadata is not found`. Observed during this audit: safe lag 7,383 → 3 consecutive failures; ~40 min later safe lag 4,772 → pass. Same check with `{ blockNumber: latest - 50n }` always passes. The `options.blockNumber` escape hatch is undocumented. |
| **F-02** | misleading | `src/generated/deployments.ts:186-190` (testnet `chain_data`); `README.md:41-42` ("immutable generated deployment input preserves reviewed provenance"); `AGENTS.md:16-17` | The committed generated input is reviewed and consistent for every published deployment. | Testnet `chain_data` pins `deployment_id "46630:launchpad:0x6993320e…:91383760"` / launchpad `0x6993320E…` / start `91383760`, while the `contracts` block at `:193-194` — the one actually exported — pins `0x9fe4f17b…` at `92793378`. `0x6993320E…` is live code (22,759 B) but a **previous-generation testnet launchpad**: lacks `DEFAULT_CURVE_ID`/`curveCount`/`graduationPoolDeployer`/`launchEscrowDeployer` (all revert), own FeeController `0x39e5b82f…` (created at block 91383760 — the stale start block), 6 launches, last event at 91,975,020. `0x9fe4f17b…` is gen-12: created 92793386, hash matches manifest, compat PASS. `sanitize-built-deployments.mjs` strips `chain_data` from `dist/`, so **npm consumers never see it** — but `provenance/current.json` pins only mainnet, so nothing catches the drift. |
| **F-03** | cosmetic (internal) | `src/generated/deployments.ts:149-152` (testnet `release_authorities.timelock`) | `0xf3fcb520…`, `delay_seconds: 0` | Testnet proxy-upgrade gate `timelock()` returns `0x42325262…` (= `launchpad.governance()`). `0xf3fcb520…` is the **mainnet Router** address — copy-paste. Mainnet timelock entry is correct (`getMinDelay()`=3600). Stripped from npm. |
| **F-04** | misleading | `README.md:224-226` | Link to `github.com/ReptilianHQ/reptilian/blob/main/docs/SDK_STANDARDS.md` "for the shared standard … and its dated conformance table". | Repo is not publicly reachable (404 unauthenticated). A public reader cannot see the standard, the conformance table, or the canonical script whose sha256 (`e03bec3e…`) heads `scripts/check-conformance.mjs`. |
| F-05 | misleading | `README.md:19` | Receipt verification "tied to the expected contract **and transaction envelope**". | `verify*Receipt` (`receipts.ts:93-190`) matches emitter address + decoded event fields only. Envelope checks live in the separate `verify*Transaction` family, which takes a `ConfirmedTransactionLike`, not a receipt; no shared hash links the two. |
| F-06 | cosmetic | `README.md:210-212` | `npm test` "verifies the reviewed artifact hashes, builds the package, runs the unit suite, and packs". | `check` also runs `check:public`, `check:indexing`, `check:conformance`, `test:scripts` (`package.json:82`). |
| F-07 | cosmetic | `README.md:47-48` | `readLaunchEscrowState` "verifies … deployed bytecode". | Verifies bytecode is **non-empty** (`escrows.ts:260-267`); no hash comparison. |
| F-08 | cosmetic | `fixtures/robinhood-mainnet.json:3` | `"deploymentId": "robinhood-chain-mainnet"` | Every other surface uses `4663:launchpad:0x135492…:17957183` for `deploymentId`; the fixture stores a network id under that key. |
| F-09 | cosmetic | `README.md:235-236` | Vanity "regression vector is checked against the production Launchpad". | `vanity.test.ts:14-24` compares to a hard-coded constant; no RPC. (The init code was independently confirmed here: predicting from the live `createLaunchVanity` calldata of tx `0xff48909c…` yields the real token `0x0148B4eF…`.) |
| F-10 | cosmetic | `examples/envio/README.md:8-9`; `.github/workflows/ci.yml:47-49` | "archive-capable endpoints" | The shipped `rpc_url`s are not archive nodes (see F-01). A reader copying CI's URLs into `envio dev` cannot backfill from block 17,957,183. |

No documented file path, npm script, or command is missing. `CHANGELOG.md` `0.9.0` matches `package.json` and the npm registry; `Unreleased` correctly reflects HEAD being one commit past `v0.9.0`.

## 2. Chain verification summary

RPCs exactly as shipped. Full log in the audit evidence bundle (`chain-evidence.md`).

**Mainnet 4663** — 63 checks PASS, 2 FAIL (both F-01), 1 noted.
`eth_chainId`=0x1237 ✔ · `eth_getCode` non-empty 15/15 ✔ · keccak(code) == `runtime_code_hashes` 13/13 ✔ · EIP-1967 impl/admin slots ✔ · Launchpad views (`DEFAULT_CURVE_ID`=1, `MIN_CURVE_FEE_BPS`=50, `MAX_CURVE_FEE_BPS`=500, `maxGraduationCutBps`=500, `protocolCutBps`=200, `curveCount`=1, `allLaunchesLength`=17, `raiseThreshold`=4.16 ETH, all pointers == manifest, `governance`=`0x4047d08f…`) ✔ · Router/FeeController/escrowDeployer/gate/admin pointers ✔ · Launchpad created in exactly `start_block` 17957183 (tx `0x64a0b523…`), 0 Launchpad/Router logs before it ✔ · first `LaunchCreated` = block 18,582,638 = fixture tx `0xff48909c…` ✔ · 5/5 fixture receipts byte-identical ✔ · 8/8 `verify*Receipt` on live receipts ✔ · CREATE2 regression ✔ · `assertCompatibleDeployment` default (`safe`) ✘ intermittent (F-01), at explicit block ✔ · `readLaunchEscrowState` ×3 fixture tokens at explicit block ✔ · explorer resolves ✔.
Noted: FeeController has 3 proxy-lifecycle logs (`Initialized`, `Upgraded`, `AdminChanged`) at 17956952, before `start_block`. Not catalogue events; harmless for indexers.

**Testnet 46630** — 40 checks PASS, 0 FAIL on the published projection; 2 stale values in the unpublished raw input (F-02, F-03).
`eth_chainId`=0xb626 ✔ · code + hash 14/14 ✔ · EIP-1967 ✔ · Launchpad views (same constants; `raiseThreshold`=0.416 ETH; `allLaunchesLength`=1) ✔ · pointers ✔ · `start_block` 92793378 = proxy-gate creation, Launchpad at 92793386, 0 logs before start ✔ · `assertCompatibleDeployment` default ✔ (safe lag inside window at audit time) · explorer resolves ✔.

## 3. Missing coverage (correct but undocumented)

Every `package.json` `exports` entry and every named export of `src/index.ts` was imported from a simulated consumer and grepped against all `.md` files.

- **Subpaths never named in any doc:** `./economics`, `./transactions`, `./receipts`, `./vanity`; `./indexing/manifest.schema.json`; `./indexing/abis/{Router,FeeController,LaunchToken,GraduationPool}.events.json`. All 20 export targets resolve.
- **62 of 74 root exports never named in any doc**, including: `getChain`, `listChains`, `robinhoodTestnet`, all `ROBINHOOD_*` constants; `routerAbi`, `feeControllerAbi`, `graduationPoolAbi`, `lbFactoryIdentityAbi`, `lbRouterIdentityAbi`, `abiSignatures`, `ABI_REVISION`; the entire `economics` module; `buildCurveSell/Graduate/Claim/Approve/RouterBuy/RouterSell/SwapExactIn/CollectFees` transaction builders, `toRpcTransactionRequest`, `parseRpcTransactionRequest`, `decodeLaunchpadTransaction`, `decodeRouterTransaction`, 10 of 11 `verify*Transaction`; 8 `verify*Receipt` functions + `assertSuccessfulReceipt`; `DeploymentCompatibilityError`, the `DeploymentCompatibilityReport` shape, the `options.blockNumber` parameter; `listIndexingManifests`; `predictLaunchTokenAddress`, `LAUNCH_TOKEN_TOTAL_SUPPLY`, `startSalt`; 25 of 26 `SdkErrorCode` values and `SdkError`'s `path/expected/actual/toJSON`.
- **Undocumented behaviour:** `buildClaimTransaction` selects `claim()` vs `claimAll(token)` (`transactions.ts:162-168`); `buildCollectFeesTransaction` `"amm" | "lb"` venue switch (`:266-282`); `verifyBuyReceipt` `minTokensOut` / `OUTPUT_BELOW_MINIMUM`.
- **Undocumented requirements:** viem peer range `>=2.21.0 <3` (`package.json:99`); `npm run verify:deployment` with `SDK_RELEASE_CHAIN_ID` / `VERIFY_RPC`.
- **Live protocol constants the docs never state** (all confirmed on both chains): `MIN_CURVE_FEE_BPS`=50, `MAX_CURVE_FEE_BPS`=500, `maxGraduationCutBps`=500, `protocolCutBps`=200, `DEFAULT_CURVE_ID`=1, `raiseThreshold` 4.16 ETH mainnet / 0.416 ETH testnet, launch supply 1e27.
- `start_block` means different things per chain (mainnet = Launchpad creation; testnet = first gen-12 contract, 8 blocks before the Launchpad). "Deployment boundary" is never defined.
- README:125-126 says consumers own confirmation depth and reorg policy; the SDK silently imposes `safe` for its own reads (F-01).

## 4. Unverifiable

| item | why |
|---|---|
| `economics.ts:65-66` "deadline equal to current timestamp remains valid on-chain" | Router source private; not deterministically testable via `eth_call`. |
| `docs/RELICENSING.md` `git shortlog` authorship audit | Shallow clone. |
| `docs/RELEASING.md` npm trusted-publisher claims | npm-side settings/attestations not fetched; 0.4.x withdrawn. |
| `envio codegen` / `graph codegen` run instructions | Toolchains not installed; scripts exist and are wired. |
| `vanity.test.ts:14` oracle address provenance | No public `predict` view; init code validated via the real-token regression instead. |
| Whether the mainnet `safe` lag exceeding the state window is chronic | Observed for ~25 min, then cleared. Intermittent at minimum. |
| Blockscout REST cross-check | 403 (Cloudflare) from the audit environment; RPC used instead. |

## 5. Recommended maintainer actions (none applied here)

1. `src/generated/deployments.ts:186-190` — regenerate or drop the testnet `chain_data` block (`0x6993320e…` / 91383760 → `0x9fe4f17b…` / 92793378 or remove). `:149-152` testnet timelock → what the chain reports. Requires a new `provenance/current.json` and the bootstrap sha in `scripts/check-artifacts.mjs:8`.
2. `provenance/current.json` — pin the testnet deploymentId too, so `check:artifacts` catches (1) next time.
3. `README.md:162-168` — document that the default read block is `safe`, that the canonical RPCs are non-archive (~6k-block state window), and show `{ blockNumber }`. Consider having `scripts/verify-deployment.mjs` fall back to `latest - N` on a `safe` read error; today the release gate can flake on the SDK's own RPC.
4. `README.md:224-226` — make `SDK_STANDARDS.md` public, vendor the text, or drop the link.
5. `README.md:89` — state the viem peer range. `README.md:200-215` — add `verify:deployment` and the full `check` chain.
6. README API coverage — at minimum a table of the 11 subpaths and their exports, the 26 `SdkErrorCode` values, and the live protocol constants (§3).
7. Wording fixes per F-05 / F-06 / F-07 / F-09.
8. `fixtures/robinhood-mainnet.json` — optional re-pin (`finalizedObservedAt` 2026-09-05 / `pinnedAtBlock` 55251879; content still exact); rename `deploymentId` → `networkId` or use the canonical string (F-08).

## Reproduction

```
npm ci && npm test                                   # green at f55db7d
node scripts/verify-deployment.mjs                   # passes when (latest - safe) < ~6000 on the canonical RPC; fails with "metadata is not found" otherwise
SDK_RELEASE_CHAIN_ID=46630 node scripts/verify-deployment.mjs
```
Full evidence bundle (claim ledger, 269-call RPC log, consumer-import test, probe scripts) is held outside the repo and available on request.
