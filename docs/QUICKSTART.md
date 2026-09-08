# Quickstart

Start with a read-only connection to Robinhood Chain testnet. This guide targets the
0.9.0 public API, Node.js 22 or newer, and `viem >=2.21.0 <3`. The SDK does not
provide wallets or choose transaction amounts, slippage, confirmations, or RPC policy.

## Run in a new application

Create a directory, initialize it with `npm init -y`, and install:

```sh
npm pkg set type=module
npm install @reptilianhq/launch-on-block-sdk@0.9.0 'viem@^2.21.0'
npm install --save-dev typescript @types/node
```

Copy the read-only quickstart below into `quickstart.ts`. Save the following
`tsconfig.json` alongside it:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "build"
  },
  "include": ["quickstart.ts"]
}
```

```sh
npx tsc --project tsconfig.json
node build/quickstart.js
```

It prints the verified release identity, block number, indexing manifest, and fee
terms. It defaults to testnet (`46630`); set `CHAIN_ID=4663` for mainnet. `RPC_URL`
overrides the canonical public endpoint. It uses no wallet, funds, or key.

If the RPC cannot read state at `safe`, verification fails. Retry later or select
an RPC retaining that state. An explicit recent block does not carry the same
confirmation guarantee. See [verification and errors](API_REFERENCE.md#verification-and-errors).
RPC failure is not evidence of an incompatible deployment, nor a passed check.

## Run from this repository

```sh
npm ci
npm run build
npx tsc --project examples/consumer/tsconfig.json
node examples/consumer/build/quickstart.js
node examples/consumer/build/offline.js
```

`npm test` compiles all three examples against an extracted npm tarball, executes
only the offline example, and checks that the snippets below match their source
files. It does not connect a wallet or submit transactions. Live provider
availability is separate from compile-time correctness.

## Before using the wallet example

Pass a connected EIP-1193 wallet provider, a selected chain/RPC, a valid live
launch token, a positive native input in raw units, a quote-derived minimum
output, and your application's confirmation count. Obtain a fresh quote and
review token approvals and spend limits where applicable; this direct curve-buy
example sends native currency and does not require an ERC-20 approval.

Calling the function requests an account, checks chain identity, simulates,
estimates gas, and asks the wallet to send. It then verifies the actual receipted
transaction's sender, target, value, and calldata separately from its event
fields. It checks that both observations identify the same transaction and block.
A replacement with different intent is rejected, even if it mined successfully.

Simulation can become stale. User rejection, reverted execution, RPC errors,
replacement, and reorgs need application handling. A successful verification is
not a guarantee of finality; retain the returned hash/block hash and reconcile
under your application's reorg policy. Do not use an arbitrary minimum output
or a hard-coded confirmation count as a production policy.

<!-- BEGIN GENERATED -->

## Read-only quickstart

Source: [`examples/consumer/quickstart.ts`](../examples/consumer/quickstart.ts).

```ts
import { createPublicClient, defineChain, http } from "viem";
import { getDeployment } from "@reptilianhq/launch-on-block-sdk/deployments";
import { assertCompatibleDeployment } from "@reptilianhq/launch-on-block-sdk/compatibility";
import { getIndexingManifest } from "@reptilianhq/launch-on-block-sdk/indexing";
import { launchpadAbi } from "@reptilianhq/launch-on-block-sdk/abis";
import { isSdkError } from "@reptilianhq/launch-on-block-sdk/errors";

async function main(): Promise<void> {
  // Testnet by default. This example only reads chain state; it has no wallet or signing key.
  const chainId = Number(process.env.CHAIN_ID ?? "46630");
  const deployment = getDeployment(chainId);
  const rpcUrl = process.env.RPC_URL ?? deployment.rpcUrl;
  const chain = defineChain({
    id: deployment.chainId,
    name: deployment.name,
    nativeCurrency: deployment.nativeCurrency,
    rpcUrls: { default: { http: [rpcUrl] } },
  });
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const report = await assertCompatibleDeployment(client, deployment);
  // Use the same numbered safe block for all the following observations.
  const blockNumber = report.blockNumber;
  const [minFee, maxFee, maxCut, protocolCut, defaultCurveId] = await Promise.all([
    client.readContract({ address: deployment.contracts.launchpad, abi: launchpadAbi, functionName: "MIN_CURVE_FEE_BPS", blockNumber }),
    client.readContract({ address: deployment.contracts.launchpad, abi: launchpadAbi, functionName: "MAX_CURVE_FEE_BPS", blockNumber }),
    client.readContract({ address: deployment.contracts.launchpad, abi: launchpadAbi, functionName: "maxGraduationCutBps", blockNumber }),
    client.readContract({ address: deployment.contracts.launchpad, abi: launchpadAbi, functionName: "protocolCutBps", blockNumber }),
    client.readContract({ address: deployment.contracts.launchpad, abi: launchpadAbi, functionName: "DEFAULT_CURVE_ID", blockNumber }),
  ]);
  console.log(JSON.stringify({
    chainId, releaseId: report.releaseId, blockNumber: blockNumber.toString(),
    launchpad: deployment.contracts.launchpad,
    indexing: getIndexingManifest(chainId),
    terms: { minFee, maxFee, maxCut, protocolCut, defaultCurveId },
  }, (_, value) => typeof value === "bigint" ? value.toString() : value, 2));
}

main().catch((error: unknown) => {
  if (isSdkError(error)) console.error(JSON.stringify(error.toJSON()));
  else console.error("RPC read failed. Confirm the endpoint's chain and safe-block state availability, then retry.");
  process.exitCode = 1;
});
```

## Wallet integration

Source: [`examples/consumer/buy.ts`](../examples/consumer/buy.ts). Import this function into your application; importing it does not submit a transaction.

```ts
import {
  createPublicClient, createWalletClient, custom, defineChain, http, getAddress,
  type Address, type EIP1193Provider,
} from "viem";
import { getDeployment } from "@reptilianhq/launch-on-block-sdk/deployments";
import { assertCompatibleDeployment } from "@reptilianhq/launch-on-block-sdk/compatibility";
import { buildCurveBuyTransaction, verifyCurveBuyTransaction } from "@reptilianhq/launch-on-block-sdk/transactions";
import { verifyBuyReceipt } from "@reptilianhq/launch-on-block-sdk/receipts";

// Import this function into a wallet-connected application. Nothing runs merely by importing it.
// Call only after your UI has reviewed the quote/amounts and the user has chosen to submit.
export async function buyWithConnectedWallet(input: {
  provider: EIP1193Provider;
  chainId: number;
  rpcUrl: string;
  token: Address;
  value: bigint;
  minTokensOut: bigint;
  confirmations: number;
}) {
  if (!Number.isSafeInteger(input.confirmations) || input.confirmations < 1) {
    throw new Error("Choose a positive confirmation count under your application's reorg policy");
  }
  const deployment = getDeployment(input.chainId);
  const chain = defineChain({
    id: deployment.chainId, name: deployment.name, nativeCurrency: deployment.nativeCurrency,
    rpcUrls: { default: { http: [input.rpcUrl] } },
  });
  const publicClient = createPublicClient({ chain, transport: http(input.rpcUrl) });
  const walletClient = createWalletClient({ chain, transport: custom(input.provider) });
  if (await walletClient.getChainId() !== chain.id) throw new Error("Switch the connected wallet to the selected chain");
  const [account] = await walletClient.requestAddresses();
  if (!account) throw new Error("Connect a wallet account");
  await assertCompatibleDeployment(publicClient, deployment);
  const parameters = { token: input.token, value: input.value, minTokensOut: input.minTokensOut };
  const request = buildCurveBuyTransaction(deployment.contracts.launchpad, parameters);
  // Simulation is a point-in-time check. It cannot guarantee execution after chain state changes.
  await publicClient.call({ account, ...request });
  const gas = await publicClient.estimateGas({ account, ...request });
  const hash = await walletClient.sendTransaction({ account, chain, gas, ...request });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: input.confirmations });
  // A wallet/provider may replace the submitted transaction. Fetch the one actually receipted.
  const transaction = await publicClient.getTransaction({ hash: receipt.transactionHash });
  if (transaction.hash !== receipt.transactionHash || transaction.blockHash !== receipt.blockHash) {
    throw new Error("Transaction and receipt do not identify the same mined transaction; reconcile before accepting");
  }
  verifyCurveBuyTransaction(transaction, deployment.contracts.launchpad, account, parameters);
  const buy = verifyBuyReceipt(receipt, deployment.contracts.launchpad, {
    token: getAddress(input.token), buyer: getAddress(account), amountIn: input.value,
    minTokensOut: input.minTokensOut,
  });
  return { hash: receipt.transactionHash, blockHash: receipt.blockHash, buy };
}
```

## Offline examples

Source: [`examples/consumer/offline.ts`](../examples/consumer/offline.ts). This file makes no RPC calls and is executed by the package check.

```ts
import assert from "node:assert/strict";
import { toHex } from "viem";
import { robinhoodTestnet } from "@reptilianhq/launch-on-block-sdk/deployments";
import { calculateSlippageFloor } from "@reptilianhq/launch-on-block-sdk/economics";
import { buildClaimTransaction, decodeLaunchpadTransaction } from "@reptilianhq/launch-on-block-sdk/transactions";
import { mineLaunchTokenVanitySalt, predictLaunchTokenAddress } from "@reptilianhq/launch-on-block-sdk/vanity";

const launchpad = robinhoodTestnet.contracts.launchpad;
assert.equal(calculateSlippageFloor(10_000n, 100), 9_900n); // 100 bps = 1%; raw units.
assert.equal(decodeLaunchpadTransaction(buildClaimTransaction(launchpad).data).functionName, "claim");
const token = "0x1111111111111111111111111111111111111111" as const; // Encoding example only.
assert.equal(decodeLaunchpadTransaction(buildClaimTransaction(launchpad, token).data).functionName, "claimAll");

const parameters = {
  launchpad, creator: "0x2222222222222222222222222222222222222222" as const,
  name: "Example Token", symbol: "EXAMPLE", metadataUri: "https://example.com/token.json",
};
const address = predictLaunchTokenAddress({ ...parameters, salt: toHex(1n, { size: 32 }) });
const startSalt = 1n;
const maxAttempts = 10;
const result = mineLaunchTokenVanitySalt({ ...parameters, suffix: address.slice(-1), startSalt, maxAttempts });
assert.ok(result); // The first candidate is known to match this chosen demonstration suffix.
assert.equal(result.address.toLowerCase(), address.toLowerCase());
// For an arbitrary suffix, null means try startSalt + BigInt(maxAttempts) next, subject to uint256 bounds.
console.log("Offline encoding, arithmetic, and vanity examples passed.");
```

<!-- END GENERATED -->
