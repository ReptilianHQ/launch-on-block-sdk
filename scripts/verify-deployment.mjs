import { createPublicClient, http } from "viem";
import { pathToFileURL } from "node:url";

import { assertCompatibleDeployment, getDeployment, isSdkError } from "../dist/index.js";

function isUnavailableState(error) {
  // Recognize the observed RPC failure through viem's cause wrappers. Never retry SDK mismatches.
  const seen = new Set();
  for (let cause = error; cause && typeof cause === "object" && !seen.has(cause); cause = cause.cause) {
    seen.add(cause);
    if (isSdkError(cause)) return false;
  }
  for (const cause of seen) {
    if (/metadata is not found|missing trie node/i.test(String(cause.message))) return true;
  }
  return false;
}

export async function verifyDeploymentWithRetry(client, deployment, {
  verify = assertCompatibleDeployment,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  onRetry = () => {},
} = {}) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // Each attempt selects a numbered safe block again. No latest-block fallback or override.
      return await verify(client, deployment);
    } catch (error) {
      if (!isUnavailableState(error)) throw error;
      if (attempt === 3) {
        throw new Error("RPC could not serve the safe-block state after 3 attempts. Retry later or set VERIFY_RPC to an endpoint that retains state at the safe block. Verification did not pass; no recent-block fallback was used.", { cause: error });
      }
      onRetry(attempt);
      await wait(2000);
    }
  }
}

async function main() {
  const chainId = Number(process.env.SDK_RELEASE_CHAIN_ID ?? 4663);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error("SDK_RELEASE_CHAIN_ID must be a positive integer");
  }
  const deployment = getDeployment(chainId);
  const client = createPublicClient({ transport: http(process.env.VERIFY_RPC || deployment.rpcUrl) });
  console.log(`verifying ${deployment.contracts.releaseId} on chain ${chainId} via ${process.env.VERIFY_RPC ? "configured" : "canonical public"} RPC`);
  const report = await verifyDeploymentWithRetry(client, deployment, {
    onRetry: (attempt) => console.error(`Safe-block state unavailable (attempt ${attempt}/3); retrying in 2 seconds.`),
  });
  console.log(JSON.stringify({
    releaseId: report.releaseId, chainId, launchpad: deployment.contracts.launchpad,
    blockNumber: report.blockNumber.toString(),
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    // Do not print nested transport causes, which may contain a configured endpoint's credentials.
    console.error(error.shortMessage ?? error.message);
    process.exitCode = 1;
  });
}
