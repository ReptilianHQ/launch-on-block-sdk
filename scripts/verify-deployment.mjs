import { createPublicClient, http } from "viem";

import { assertCompatibleDeployment, getDeployment } from "../dist/index.js";

const chainId = Number(process.env.SDK_RELEASE_CHAIN_ID ?? 4663);
if (!Number.isSafeInteger(chainId) || chainId <= 0) {
  throw new Error("SDK_RELEASE_CHAIN_ID must be a positive integer");
}

const deployment = getDeployment(chainId);
const rpcUrl = process.env.VERIFY_RPC || deployment.rpcUrl;
const client = createPublicClient({ transport: http(rpcUrl) });

console.log(
  `verifying ${deployment.contracts.releaseId} on chain ${chainId} via ${process.env.VERIFY_RPC ? "configured" : "canonical public"} RPC`,
);
const report = await assertCompatibleDeployment(client, deployment);
console.log(JSON.stringify({
  releaseId: report.releaseId,
  chainId,
  launchpad: deployment.contracts.launchpad,
  blockNumber: report.blockNumber.toString(),
}, null, 2));
