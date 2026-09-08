# Pinned fork release verification

Use Node 24, the committed npm lockfile, and Foundry `anvil` on PATH:

```sh
npm ci
SDK_FORK_EIP155_4663_RPC_URL=<archive-rpc> npm run test:fork -- --required
npm run check:fork-evidence
```

Supply the endpoint through the environment; never commit credentials. Without
that variable, ordinary `test:fork` prints a clear skip and writes no evidence.
`--required` fails instead. `npm test` excludes fork execution so normal CI and
package construction remain offline. Publication validates the committed proof
without reading an RPC endpoint or private source checkout.

The suite pins mainnet block **58042380**, hash
`0xf41279681f1d795570a4b76f7a09cda5a90cd1b8d77bde014cfba9d26b5bb3ea`,
observed as a numbered latest block on 2026-09-08. It verifies the block hash and
all reviewed SDK deployment runtime hashes and pointers before executing tests.
This pin makes no finality claim. Existing finalized receipt fixtures provide
separate historical evidence. Unavailable state fails; there is no automatic
repin or fallback to latest. The public RPC has short state retention, so future
reruns may require an archive endpoint retaining this exact block.

Anvil binds only to loopback. All funding, impersonation and submissions target
that new local process. The upstream RPC is used only for fork reads. The
process is stopped after the suite. No wallet keys, serving databases, private
contract source or deployment artifacts are used.

The three suites cover:

- Hegel-generated curve buy/sell amounts and slippage tolerances: contract quotes
  equal simulated returns and mined receipt outputs; protected calldata matches
  reviewed intent; a floor above actual output reverts; round trips cannot create
  native value.
- Generated router swaps in both curve directions: quote/output equality and
  transaction/receipt attribution to the reviewed sender, recipient and pool.
- Launch creation with SDK-validated live fee bounds and creator-cut capacity,
  graduation accounting, generated graduated-pool buys, and collected fee
  conservation through SDK verifiers. Creation setup exercises the combined
  verifier and its two constituent event verifiers.

Launch On Block does not expose an independent curve pricing function in its
SDK. Differential coverage therefore compares on-chain quotes to simulated and
mined execution, applying SDK slippage floors and checking SDK receipt evidence.
It does not claim a separate off-chain pricing model. LB venue swaps/collection,
vanity creation overloads and claim execution are not covered by this fork suite;
existing construction properties cover their SDK transaction encoding.

`docs/fork-evidence.json` records the successful non-skipped run and hashes every
SDK source file, the runner, package/lockfile and TypeScript configuration. Any
change to those inputs requires fresh evidence before publication. Run these
suites on every release and compatibility change. Fork results prove neither
production signing, mempool behavior, finality nor reorg recovery.
