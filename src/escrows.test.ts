import { describe, expect, it } from "vitest";
import { getAddress, zeroAddress, type Address, type PublicClient } from "viem";
import { getDeployment, ROBINHOOD_CHAIN_TESTNET_ID } from "./deployments.js";
import { readLaunchEscrowState } from "./escrows.js";

const deployment = getDeployment(ROBINHOOD_CHAIN_TESTNET_ID);
const token = getAddress("0x2222222222222222222222222222222222222222");
const escrow = getAddress("0x3333333333333333333333333333333333333333");

function client(options: {
  mappedEscrow?: Address;
  predictedEscrow?: Address;
  escrowLaunchpad?: Address;
  escrowToken?: Address;
  bytecode?: `0x${string}` | undefined;
  chainId?: number;
} = {}): PublicClient {
  const mappedEscrow = options.mappedEscrow ?? escrow;
  const predictedEscrow = options.predictedEscrow ?? escrow;
  return {
    getChainId: async () => options.chainId ?? ROBINHOOD_CHAIN_TESTNET_ID,
    getBlock: async () => ({ number: 123n }),
    getBytecode: async () => options.bytecode ?? (mappedEscrow === zeroAddress ? "0x" : "0x6000"),
    readContract: async ({ address, functionName }: { address: Address; functionName: string }) => {
      if (functionName === "escrowOf") return mappedEscrow;
      if (functionName === "predict") return predictedEscrow;
      if (functionName === "launchpad") return options.escrowLaunchpad ?? deployment.contracts.launchpad;
      if (functionName === "token") return options.escrowToken ?? token;
      if (functionName === "backing") return 42n;
      throw new Error(`unexpected read ${address}:${functionName}`);
    },
  } as unknown as PublicClient;
}

describe("launch escrow state", () => {
  it("returns a verified deployed escrow with raw backing", async () => {
    await expect(readLaunchEscrowState(client(), deployment, token)).resolves.toEqual({
      status: "deployed",
      chainId: ROBINHOOD_CHAIN_TESTNET_ID,
      blockNumber: 123n,
      launchpad: getAddress(deployment.contracts.launchpad),
      token,
      predictedEscrow: escrow,
      escrow,
      backing: 42n,
    });
  });

  it("returns a typed absence when the launchpad has not mapped an escrow", async () => {
    await expect(readLaunchEscrowState(client({ mappedEscrow: zeroAddress }), deployment, token)).resolves.toMatchObject({
      status: "not_deployed",
      predictedEscrow: escrow,
      escrow: null,
      backing: null,
    });
  });

  it("fails closed on predicted and embedded pointer mismatches", async () => {
    await expect(readLaunchEscrowState(
      client({ mappedEscrow: zeroAddress, predictedEscrow: zeroAddress }),
      deployment,
      token,
    )).rejects.toMatchObject({ code: "POINTER_MISMATCH", path: "predictedEscrow" });
    await expect(readLaunchEscrowState(
      client({ mappedEscrow: zeroAddress, bytecode: "0x6000" }),
      deployment,
      token,
    )).rejects.toMatchObject({ code: "POINTER_MISMATCH", path: "predictedEscrow" });
    await expect(readLaunchEscrowState(
      client({ predictedEscrow: getAddress("0x4444444444444444444444444444444444444444") }),
      deployment,
      token,
    )).rejects.toMatchObject({ code: "POINTER_MISMATCH", path: "escrow" });
    await expect(readLaunchEscrowState(
      client({ escrowToken: getAddress("0x5555555555555555555555555555555555555555") }),
      deployment,
      token,
    )).rejects.toMatchObject({ code: "POINTER_MISMATCH", path: "escrow.token" });
  });

  it("rejects the wrong chain, zero token, and missing escrow code", async () => {
    await expect(readLaunchEscrowState(
      client({ chainId: ROBINHOOD_CHAIN_TESTNET_ID + 1 }),
      deployment,
      token,
    )).rejects.toMatchObject({ code: "CHAIN_MISMATCH" });
    await expect(readLaunchEscrowState(client(), deployment, zeroAddress)).rejects.toMatchObject({
      code: "INVALID_ADDRESS",
      path: "token",
    });
    await expect(readLaunchEscrowState(client({ bytecode: "0x" }), deployment, token)).rejects.toMatchObject({
      code: "CODE_MISSING",
      path: "escrow",
    });
  });
});
