import {
  getAddress,
  isAddress,
  zeroAddress,
  type Address,
  type PublicClient,
} from "viem";
import {
  launchEscrowAbi,
  launchEscrowDeployerAbi,
  launchpadAbi,
} from "./generated/abis.js";
import type { Deployment, ProtocolContracts } from "./deployments.js";
import { SdkError } from "./errors.js";

interface LaunchEscrowStateBase {
  /** Chain and block at which every returned value was read. */
  chainId: number;
  blockNumber: bigint;
  launchpad: Address;
  token: Address;
  /** Deterministic address derived by the reviewed escrow deployer. */
  predictedEscrow: Address;
}

export type LaunchEscrowState =
  | LaunchEscrowStateBase & {
    status: "not_deployed";
    escrow: null;
    backing: null;
  }
  | LaunchEscrowStateBase & {
    status: "deployed";
    escrow: Address;
    /** Raw protocol accounting value. This is not liquidity, TVL, price, or wallet value. */
    backing: bigint;
  };

/**
 * Reads and verifies the escrow associated with one launch token at a single safe block.
 *
 * The returned `backing` is deliberately unpriced protocol accounting data. Consumers must not
 * present it as liquidity, TVL, redeemable value, or wallet value without a separate reviewed model.
 */
export async function readLaunchEscrowState(
  client: PublicClient,
  deployment: Deployment & { contracts: ProtocolContracts },
  token: Address,
  options: { blockNumber?: bigint } = {},
): Promise<LaunchEscrowState> {
  if (!isAddress(token) || getAddress(token) === zeroAddress) {
    throw new SdkError("INVALID_ADDRESS", "token must be a nonzero EVM address", {
      path: "token",
      expected: "nonzero 20-byte EVM address",
      actual: token,
    });
  }

  const chainId = await client.getChainId();
  if (chainId !== deployment.chainId) {
    throw new SdkError("CHAIN_MISMATCH", `RPC chain ${chainId} does not match deployment chain ${deployment.chainId}`, {
      path: "chainId",
      expected: String(deployment.chainId),
      actual: String(chainId),
    });
  }

  const blockNumber = options.blockNumber ?? (await client.getBlock({ blockTag: "safe" })).number;
  if (blockNumber === null) {
    throw new SdkError("CODE_MISSING", "RPC did not return a numbered safe block", {
      path: "blockNumber",
      expected: "a numbered safe block",
      actual: "null",
    });
  }

  const normalizedToken = getAddress(token);
  const launchpad = getAddress(deployment.contracts.launchpad);
  const [mappedEscrowValue, predictedEscrowValue] = await Promise.all([
    client.readContract({
      address: launchpad,
      abi: launchpadAbi,
      functionName: "escrowOf",
      args: [normalizedToken],
      blockNumber,
    }),
    client.readContract({
      address: deployment.contracts.launchEscrowDeployer.address,
      abi: launchEscrowDeployerAbi,
      functionName: "predict",
      args: [launchpad, normalizedToken],
      blockNumber,
    }),
  ]);
  const mappedEscrow = getAddress(mappedEscrowValue);
  const predictedEscrow = getAddress(predictedEscrowValue);
  if (predictedEscrow === zeroAddress) {
    throw new SdkError("POINTER_MISMATCH", "Reviewed escrow deployer predicted the zero address", {
      path: "predictedEscrow",
      expected: "nonzero deterministic escrow address",
      actual: predictedEscrow,
    });
  }
  const base = { chainId, blockNumber, launchpad, token: normalizedToken, predictedEscrow };

  if (mappedEscrow === zeroAddress) {
    const predictedCode = await client.getBytecode({ address: predictedEscrow, blockNumber });
    if (predictedCode && predictedCode !== "0x") {
      throw new SdkError("POINTER_MISMATCH", "Predicted escrow has bytecode but is not mapped by the Launchpad", {
        path: "predictedEscrow",
        expected: "no bytecode before Launchpad mapping",
        actual: "deployed bytecode",
      });
    }
    return { ...base, status: "not_deployed", escrow: null, backing: null };
  }
  if (mappedEscrow !== predictedEscrow) {
    throw new SdkError("POINTER_MISMATCH", "Launchpad escrow does not match the reviewed deployer prediction", {
      path: "escrow",
      expected: predictedEscrow,
      actual: mappedEscrow,
    });
  }

  const bytecode = await client.getBytecode({ address: mappedEscrow, blockNumber });
  if (!bytecode || bytecode === "0x") {
    throw new SdkError("CODE_MISSING", "Mapped launch escrow has no deployed bytecode", {
      path: "escrow",
      expected: "deployed bytecode",
      actual: "0x",
    });
  }
  const [escrowLaunchpadValue, escrowTokenValue, backing] = await Promise.all([
    client.readContract({ address: mappedEscrow, abi: launchEscrowAbi, functionName: "launchpad", blockNumber }),
    client.readContract({ address: mappedEscrow, abi: launchEscrowAbi, functionName: "token", blockNumber }),
    client.readContract({ address: mappedEscrow, abi: launchEscrowAbi, functionName: "backing", blockNumber }),
  ]);
  assertPointer("escrow.launchpad", launchpad, getAddress(escrowLaunchpadValue));
  assertPointer("escrow.token", normalizedToken, getAddress(escrowTokenValue));

  return { ...base, status: "deployed", escrow: mappedEscrow, backing };
}

function assertPointer(path: string, expected: Address, actual: Address): void {
  if (expected !== actual) {
    throw new SdkError("POINTER_MISMATCH", `${path} does not match the expected address`, {
      path,
      expected,
      actual,
    });
  }
}
