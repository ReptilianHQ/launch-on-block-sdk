import type { Address, Hex } from "viem";
import { deploymentManifest as generatedDeploymentManifest } from "./generated/deployments.js";
import { SdkError } from "./errors.js";

export const deploymentManifest = deepFreeze(generatedDeploymentManifest);

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_CHAIN_TESTNET_ID = 46630;

export type BlockchainEnvironment = "mainnet" | "testnet" | "local";

export interface ContractIdentity {
  readonly address: Address;
  readonly runtimeCodeHash: Hex;
}

export interface ProtocolContracts {
  readonly releaseId: string;
  readonly abiRevision: string;
  readonly generation: string;
  readonly startBlock: number;
  readonly launchpad: Address;
  readonly launchpadType: "immutable";
  readonly feeController: Address;
  readonly router: Address;
  readonly lbFactory: Address;
  readonly lbPairImplementation: Address;
  readonly lbRouter: Address;
  readonly feeControllerAdmin: ContractIdentity;
  readonly defaultCurve: ContractIdentity & { readonly id: number };
  readonly graduationPoolDeployer: ContractIdentity;
  readonly launchEscrowDeployer: ContractIdentity & {
    readonly implementation: ContractIdentity;
  };
  readonly proxyUpgradeGate: ContractIdentity;
  readonly runtimeCodeHashes: {
    readonly launchpad: Hex;
    readonly feeController: Hex;
    readonly router: Hex;
    readonly lbFactory: Hex;
    readonly lbPairImplementation: Hex;
    readonly lbRouter: Hex;
    readonly curveId1: Hex;
    readonly poolDeployer: Hex;
    readonly escrowDeployer: Hex;
    readonly escrowImplementation: Hex;
    readonly proxyUpgradeGate: Hex;
    readonly feeControllerAdmin: Hex;
  };
  readonly implementations: {
    readonly launchpad: null;
    readonly feeController: ContractIdentity;
  };
}

export interface Deployment {
  readonly name: string;
  readonly blockchainEnvironment: BlockchainEnvironment;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorerUrl: string | null;
  readonly nativeCurrency: { readonly name: string; readonly symbol: string; readonly decimals: number };
  readonly addresses: { readonly wNative: Address | null; readonly usdg: Address | null };
  readonly contracts: ProtocolContracts | null;
}

interface ManifestImplementations {
  launchpad: null;
  fee_controller: { address: string; runtime_code_hash: string };
}

const deployments: readonly Deployment[] = deepFreeze(Object.values(deploymentManifest.robinhood).map((network) => ({
  name: network.name,
  blockchainEnvironment: network.blockchain_env,
  chainId: network.chain_id,
  rpcUrl: network.rpc_url,
  explorerUrl: network.explorer_url,
  nativeCurrency: network.native_currency,
  addresses: {
    wNative: network.addresses.w_native as Address | null,
    usdg: network.addresses.usdg as Address | null,
  },
  contracts: network.contracts === null ? null : {
    releaseId: network.contracts.release_id,
    abiRevision: network.contracts.abi_revision,
    generation: network.contracts.generation,
    startBlock: network.contracts.start_block,
    launchpad: network.contracts.launchpad as Address,
    launchpadType: network.contracts.launchpad_type,
    feeController: network.contracts.fee_controller as Address,
    router: network.contracts.router as Address,
    lbFactory: network.contracts.lb_factory as Address,
    lbPairImplementation: network.contracts.lb_pair_implementation as Address,
    lbRouter: network.contracts.lb_router as Address,
    feeControllerAdmin: {
      address: network.contracts.fee_controller_admin as Address,
      runtimeCodeHash: network.contracts.runtime_code_hashes.fee_controller_admin as Hex,
    },
    defaultCurve: {
      id: 1,
      address: network.contracts.curve_id_1 as Address,
      runtimeCodeHash: network.contracts.runtime_code_hashes.curve_id_1 as Hex,
    },
    graduationPoolDeployer: {
      address: network.contracts.pool_deployer as Address,
      runtimeCodeHash: network.contracts.runtime_code_hashes.pool_deployer as Hex,
    },
    launchEscrowDeployer: {
      address: network.contracts.escrow_deployer as Address,
      runtimeCodeHash: network.contracts.runtime_code_hashes.escrow_deployer as Hex,
      implementation: {
        address: network.contracts.escrow_implementation as Address,
        runtimeCodeHash: network.contracts.runtime_code_hashes.escrow_implementation as Hex,
      },
    },
    proxyUpgradeGate: {
      address: network.contracts.proxy_upgrade_gate as Address,
      runtimeCodeHash: network.contracts.runtime_code_hashes.proxy_upgrade_gate as Hex,
    },
    runtimeCodeHashes: {
      launchpad: network.contracts.runtime_code_hashes.launchpad as Hex,
      feeController: network.contracts.runtime_code_hashes.fee_controller as Hex,
      router: network.contracts.runtime_code_hashes.router as Hex,
      lbFactory: network.contracts.runtime_code_hashes.lb_factory as Hex,
      lbPairImplementation: network.contracts.runtime_code_hashes.lb_pair_implementation as Hex,
      lbRouter: network.contracts.runtime_code_hashes.lb_router as Hex,
      curveId1: network.contracts.runtime_code_hashes.curve_id_1 as Hex,
      poolDeployer: network.contracts.runtime_code_hashes.pool_deployer as Hex,
      escrowDeployer: network.contracts.runtime_code_hashes.escrow_deployer as Hex,
      escrowImplementation: network.contracts.runtime_code_hashes.escrow_implementation as Hex,
      proxyUpgradeGate: network.contracts.runtime_code_hashes.proxy_upgrade_gate as Hex,
      feeControllerAdmin: network.contracts.runtime_code_hashes.fee_controller_admin as Hex,
    },
    implementations: normalizeImplementations(network.contracts.implementations),
  },
})));

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function normalizeImplementations(
  implementations: ManifestImplementations,
): ProtocolContracts["implementations"] {
  return {
    launchpad: null,
    feeController: normalizeIdentity(implementations.fee_controller),
  };
}

function normalizeIdentity(identity: { address: string; runtime_code_hash: string }): ContractIdentity {
  return {
    address: identity.address as Address,
    runtimeCodeHash: identity.runtime_code_hash as Hex,
  };
}

export function getChain(chainId: number): Deployment {
  const deployment = deployments.find((candidate) => candidate.chainId === chainId);
  if (!deployment) {
    throw new SdkError("UNSUPPORTED_CHAIN", `Unsupported chain ID ${chainId}`, {
      path: "chainId",
      actual: String(chainId),
    });
  }
  return deployment;
}

export function getDeployment(chainId: number): Deployment & { contracts: ProtocolContracts } {
  const deployment = getChain(chainId);
  if (!deployment.contracts) {
    throw new SdkError("DEPLOYMENT_NOT_FOUND", `No protocol deployment is recorded for chain ID ${chainId}`, {
      path: "contracts",
      actual: "null",
    });
  }
  return deployment as Deployment & { contracts: ProtocolContracts };
}

export function listChains(): readonly Deployment[] {
  return deployments;
}

export const robinhoodMainnet = getDeployment(ROBINHOOD_CHAIN_ID);
export const robinhoodTestnet = getDeployment(ROBINHOOD_CHAIN_TESTNET_ID);

export const ROBINHOOD_MAINNET_LAUNCHPAD_ADDRESS = robinhoodMainnet.contracts.launchpad;
export const ROBINHOOD_MAINNET_LAUNCHPAD_START_BLOCK = robinhoodMainnet.contracts.startBlock;
export const ROBINHOOD_MAINNET_WETH_ADDRESS = robinhoodMainnet.addresses.wNative as Address;
export const ROBINHOOD_TESTNET_LAUNCHPAD_ADDRESS = robinhoodTestnet.contracts.launchpad;
export const ROBINHOOD_TESTNET_LAUNCHPAD_START_BLOCK = robinhoodTestnet.contracts.startBlock;
export const ROBINHOOD_TESTNET_WETH_ADDRESS = robinhoodTestnet.addresses.wNative as Address;
