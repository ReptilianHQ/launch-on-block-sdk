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
