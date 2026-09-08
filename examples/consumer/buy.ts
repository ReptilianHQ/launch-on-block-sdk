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
