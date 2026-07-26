import {
  getAddress,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { ABI_REVISION } from "./generated/abis.js";
import {
  feeControllerAbi,
  launchpadAbi,
  launchEscrowDeployerAbi,
  lbFactoryIdentityAbi,
  lbRouterIdentityAbi,
  proxyAdminIdentityAbi,
  proxyUpgradeGateIdentityAbi,
  routerAbi,
} from "./generated/abis.js";
import type { ContractIdentity, Deployment, ProtocolContracts } from "./deployments.js";
import { SdkError, type SdkErrorCode } from "./errors.js";

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc" as const;
const EIP1967_ADMIN_SLOT =
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103" as const;

export type DeploymentCompatibilityErrorCode = Extract<SdkErrorCode,
  | "ADMIN_MISMATCH"
  | "ABI_REVISION_MISMATCH"
  | "CHAIN_MISMATCH"
  | "CODE_MISSING"
  | "CODE_HASH_MISMATCH"
  | "IMPLEMENTATION_MISMATCH"
  | "POINTER_MISMATCH">;

export class DeploymentCompatibilityError extends SdkError {
  declare public readonly code: DeploymentCompatibilityErrorCode;

  constructor(
    code: DeploymentCompatibilityErrorCode,
    public readonly path: string,
    public readonly expected: string,
    public readonly actual: string,
  ) {
    super(code, `${path} is incompatible: expected ${expected}, got ${actual}`, {
      path,
      expected,
      actual,
    });
    this.name = "DeploymentCompatibilityError";
  }
}

export interface DeploymentCompatibilityReport {
  chainId: number;
  blockNumber: bigint;
  releaseId: string;
  abiRevision: string;
  codeHashes: ProtocolContracts["runtimeCodeHashes"];
  pointers: {
    launchpadFeeController: Address;
    launchpadWNative: Address;
    launchpadGovernance: Address;
    launchpadGraduationPoolDeployer: Address;
    launchpadEscrowDeployer: Address;
    launchpadDefaultCurveId: number;
    launchpadDefaultCurve: Address;
    escrowImplementation: Address;
    feeControllerLaunchpad: Address;
    feeControllerLbFactory: Address;
    feeControllerProxyAdmin: Address;
    feeControllerProxyAdminOwner: Address;
    proxyUpgradeGateTimelock: Address;
    routerLaunchpad: Address;
    routerLbFactory: Address;
    routerWNative: Address;
    lbFactoryFeeRecipient: Address;
    lbFactoryPairImplementation: Address;
    lbRouterFactory: Address;
    lbRouterWNative: Address;
  };
}

/**
 * Proves that an RPC is serving the manifest-bound release before a consumer trusts it.
 * This checks identity and wiring, not operational state such as pause status or balances.
 */
export async function assertCompatibleDeployment(
  client: PublicClient,
  deployment: Deployment & { contracts: ProtocolContracts },
  options: { blockNumber?: bigint } = {},
): Promise<DeploymentCompatibilityReport> {
  const contracts = deployment.contracts;
  if (contracts.abiRevision !== ABI_REVISION) {
    throw new DeploymentCompatibilityError(
      "ABI_REVISION_MISMATCH",
      "contracts.abiRevision",
      ABI_REVISION,
      contracts.abiRevision,
    );
  }

  const chainId = await client.getChainId();
  if (chainId !== deployment.chainId) {
    throw new DeploymentCompatibilityError("CHAIN_MISMATCH", "chainId", String(deployment.chainId), String(chainId));
  }
  const blockNumber = options.blockNumber ?? (await client.getBlock({ blockTag: "safe" })).number;
  if (blockNumber === null) {
    throw new DeploymentCompatibilityError("CODE_MISSING", "blockNumber", "a numbered safe block", "null");
  }

  const codeTargets = [
    ["launchpad", contracts.launchpad, contracts.runtimeCodeHashes.launchpad],
    ["feeController", contracts.feeController, contracts.runtimeCodeHashes.feeController],
    ["router", contracts.router, contracts.runtimeCodeHashes.router],
    ["lbFactory", contracts.lbFactory, contracts.runtimeCodeHashes.lbFactory],
    ["lbPairImplementation", contracts.lbPairImplementation, contracts.runtimeCodeHashes.lbPairImplementation],
    ["lbRouter", contracts.lbRouter, contracts.runtimeCodeHashes.lbRouter],
    ["defaultCurve", contracts.defaultCurve.address, contracts.defaultCurve.runtimeCodeHash],
    ["graduationPoolDeployer", contracts.graduationPoolDeployer.address, contracts.graduationPoolDeployer.runtimeCodeHash],
    ["launchEscrowDeployer", contracts.launchEscrowDeployer.address, contracts.launchEscrowDeployer.runtimeCodeHash],
    ["launchEscrowDeployer.implementation", contracts.launchEscrowDeployer.implementation.address,
      contracts.launchEscrowDeployer.implementation.runtimeCodeHash],
    ["proxyUpgradeGate", contracts.proxyUpgradeGate.address, contracts.proxyUpgradeGate.runtimeCodeHash],
    ["feeControllerAdmin", contracts.feeControllerAdmin.address, contracts.feeControllerAdmin.runtimeCodeHash],
  ] as const;
  await Promise.all(codeTargets.map(([path, address, expectedHash]) =>
    assertCodeHash(client, `contracts.${path}`, address, expectedHash, blockNumber)));

  if (contracts.launchpadType !== "immutable") {
    throw new DeploymentCompatibilityError(
      "IMPLEMENTATION_MISMATCH",
      "contracts.launchpadType",
      "immutable",
      contracts.launchpadType,
    );
  }
  const launchpadImplementation = contracts.implementations.launchpad as ContractIdentity | null;
  if (launchpadImplementation !== null) {
    throw new DeploymentCompatibilityError(
      "IMPLEMENTATION_MISMATCH",
      "contracts.launchpad.implementation",
      "immutable launchpad with no implementation",
      launchpadImplementation.address,
    );
  }
  const feeControllerImplementation = contracts.implementations.feeController as ContractIdentity | null;
  if (feeControllerImplementation === null) {
    throw new DeploymentCompatibilityError(
      "IMPLEMENTATION_MISMATCH",
      "contracts.feeController.implementation",
      "a pinned implementation",
      "missing implementation metadata",
    );
  }

  await Promise.all([
    assertImplementationIdentity(
      client,
      "contracts.launchpad",
      contracts.launchpad,
      contracts.implementations.launchpad,
      blockNumber,
    ),
    assertImplementationIdentity(
      client,
      "contracts.feeController",
      contracts.feeController,
      feeControllerImplementation,
      blockNumber,
    ),
    assertAdminIdentity(client, "contracts.launchpad", contracts.launchpad, null, blockNumber),
    assertAdminIdentity(
      client,
      "contracts.feeController",
      contracts.feeController,
      contracts.feeControllerAdmin.address,
      blockNumber,
    ),
  ]);

  if (deployment.addresses.wNative === null) {
    throw new DeploymentCompatibilityError("CODE_MISSING", "addresses.wNative", "a configured contract", "null");
  }
  const wNativeCode = await client.getBytecode({ address: deployment.addresses.wNative, blockNumber });
  if (!wNativeCode || wNativeCode === "0x") {
    throw new DeploymentCompatibilityError("CODE_MISSING", "addresses.wNative", "deployed bytecode", "0x");
  }

  const [
    launchpadFeeController,
    launchpadWNative,
    launchpadGovernance,
    launchpadGraduationPoolDeployer,
    launchpadEscrowDeployer,
    launchpadDefaultCurveId,
    launchpadDefaultCurve,
    escrowImplementation,
    feeControllerLaunchpad,
    feeControllerLbFactory,
    feeControllerProxyAdminOwner,
    proxyUpgradeGateTimelock,
    routerLaunchpad,
    routerLbFactory,
    routerWNative,
    lbFactoryFeeRecipient,
    lbFactoryPairImplementation,
    lbRouterFactory,
    lbRouterWNative,
  ] = await Promise.all([
    client.readContract({ address: contracts.launchpad, abi: launchpadAbi, functionName: "feeController", blockNumber }),
    client.readContract({ address: contracts.launchpad, abi: launchpadAbi, functionName: "wNative", blockNumber }),
    client.readContract({ address: contracts.launchpad, abi: launchpadAbi, functionName: "governance", blockNumber }),
    client.readContract({
      address: contracts.launchpad,
      abi: launchpadAbi,
      functionName: "graduationPoolDeployer",
      blockNumber,
    }),
    client.readContract({
      address: contracts.launchpad,
      abi: launchpadAbi,
      functionName: "launchEscrowDeployer",
      blockNumber,
    }),
    client.readContract({ address: contracts.launchpad, abi: launchpadAbi, functionName: "DEFAULT_CURVE_ID", blockNumber }),
    client.readContract({
      address: contracts.launchpad,
      abi: launchpadAbi,
      functionName: "curveImplementation",
      args: [contracts.defaultCurve.id],
      blockNumber,
    }),
    client.readContract({
      address: contracts.launchEscrowDeployer.address,
      abi: launchEscrowDeployerAbi,
      functionName: "implementation",
      blockNumber,
    }),
    client.readContract({ address: contracts.feeController, abi: feeControllerAbi, functionName: "launchpad", blockNumber }),
    client.readContract({ address: contracts.feeController, abi: feeControllerAbi, functionName: "lbFactory", blockNumber }),
    client.readContract({
      address: contracts.feeControllerAdmin.address,
      abi: proxyAdminIdentityAbi,
      functionName: "owner",
      blockNumber,
    }),
    client.readContract({
      address: contracts.proxyUpgradeGate.address,
      abi: proxyUpgradeGateIdentityAbi,
      functionName: "timelock",
      blockNumber,
    }),
    client.readContract({ address: contracts.router, abi: routerAbi, functionName: "launchpad", blockNumber }),
    client.readContract({ address: contracts.router, abi: routerAbi, functionName: "lbFactory", blockNumber }),
    client.readContract({ address: contracts.router, abi: routerAbi, functionName: "wNative", blockNumber }),
    client.readContract({
      address: contracts.lbFactory,
      abi: lbFactoryIdentityAbi,
      functionName: "getFeeRecipient",
      blockNumber,
    }),
    client.readContract({
      address: contracts.lbFactory,
      abi: lbFactoryIdentityAbi,
      functionName: "getLBPairImplementation",
      blockNumber,
    }),
    client.readContract({
      address: contracts.lbRouter,
      abi: lbRouterIdentityAbi,
      functionName: "getFactory",
      blockNumber,
    }),
    client.readContract({
      address: contracts.lbRouter,
      abi: lbRouterIdentityAbi,
      functionName: "getWNATIVE",
      blockNumber,
    }),
  ]);

  const expectedWNative = deployment.addresses.wNative;
  const pointers = {
    launchpadFeeController,
    launchpadWNative,
    launchpadGovernance,
    launchpadGraduationPoolDeployer,
    launchpadEscrowDeployer,
    launchpadDefaultCurveId,
    launchpadDefaultCurve,
    escrowImplementation,
    feeControllerLaunchpad,
    feeControllerLbFactory,
    feeControllerProxyAdmin: contracts.feeControllerAdmin.address,
    feeControllerProxyAdminOwner,
    proxyUpgradeGateTimelock,
    routerLaunchpad,
    routerLbFactory,
    routerWNative,
    lbFactoryFeeRecipient,
    lbFactoryPairImplementation,
    lbRouterFactory,
    lbRouterWNative,
  };
  assertAddress("pointers.launchpadFeeController", launchpadFeeController, contracts.feeController);
  assertAddress("pointers.launchpadWNative", launchpadWNative, expectedWNative);
  assertAddress(
    "pointers.launchpadGraduationPoolDeployer",
    launchpadGraduationPoolDeployer,
    contracts.graduationPoolDeployer.address,
  );
  assertAddress("pointers.launchpadEscrowDeployer", launchpadEscrowDeployer, contracts.launchEscrowDeployer.address);
  if (launchpadDefaultCurveId !== contracts.defaultCurve.id) {
    throw new DeploymentCompatibilityError(
      "POINTER_MISMATCH",
      "pointers.launchpadDefaultCurveId",
      String(contracts.defaultCurve.id),
      String(launchpadDefaultCurveId),
    );
  }
  assertAddress("pointers.launchpadDefaultCurve", launchpadDefaultCurve, contracts.defaultCurve.address);
  assertAddress(
    "pointers.escrowImplementation",
    escrowImplementation,
    contracts.launchEscrowDeployer.implementation.address,
  );
  assertAddress("pointers.feeControllerLaunchpad", feeControllerLaunchpad, contracts.launchpad);
  assertAddress("pointers.feeControllerLbFactory", feeControllerLbFactory, contracts.lbFactory);
  assertAddress(
    "pointers.feeControllerProxyAdminOwner",
    feeControllerProxyAdminOwner,
    contracts.proxyUpgradeGate.address,
  );
  assertAddress("pointers.proxyUpgradeGateTimelock", proxyUpgradeGateTimelock, launchpadGovernance);
  assertAddress("pointers.routerLaunchpad", routerLaunchpad, contracts.launchpad);
  assertAddress("pointers.routerLbFactory", routerLbFactory, contracts.lbFactory);
  assertAddress("pointers.routerWNative", routerWNative, expectedWNative);
  assertAddress("pointers.lbFactoryFeeRecipient", lbFactoryFeeRecipient, contracts.feeController);
  assertAddress("pointers.lbFactoryPairImplementation", lbFactoryPairImplementation, contracts.lbPairImplementation);
  assertAddress("pointers.lbRouterFactory", lbRouterFactory, contracts.lbFactory);
  assertAddress("pointers.lbRouterWNative", lbRouterWNative, expectedWNative);

  return {
    chainId,
    blockNumber,
    releaseId: contracts.releaseId,
    abiRevision: contracts.abiRevision,
    codeHashes: contracts.runtimeCodeHashes,
    pointers,
  };
}

async function assertAdminIdentity(
  client: PublicClient,
  path: string,
  contract: Address,
  expected: Address | null,
  blockNumber: bigint,
): Promise<void> {
  const actual = await readEip1967Address(client, contract, EIP1967_ADMIN_SLOT, blockNumber);
  if (expected === null ? actual !== null : actual === null || actual.toLowerCase() !== expected.toLowerCase()) {
    throw new DeploymentCompatibilityError(
      "ADMIN_MISMATCH",
      `${path}.admin`,
      expected ?? "direct deployment (empty EIP-1967 admin slot)",
      actual ?? "missing storage",
    );
  }
}

async function assertCodeHash(
  client: PublicClient,
  path: string,
  address: Address,
  expectedHash: Hex,
  blockNumber: bigint,
): Promise<void> {
  const code = await client.getBytecode({ address, blockNumber });
  if (!code || code === "0x") {
    throw new DeploymentCompatibilityError("CODE_MISSING", path, "deployed bytecode", "0x");
  }
  const actualHash = keccak256(code);
  if (actualHash.toLowerCase() !== expectedHash.toLowerCase()) {
    throw new DeploymentCompatibilityError("CODE_HASH_MISMATCH", path, expectedHash, actualHash);
  }
}

async function assertImplementationIdentity(
  client: PublicClient,
  path: string,
  contract: Address,
  expected: { address: Address; runtimeCodeHash: Hex } | null,
  blockNumber: bigint,
): Promise<void> {
  const actual = await readEip1967Address(client, contract, EIP1967_IMPLEMENTATION_SLOT, blockNumber);
  if (expected === null) {
    if (actual !== null) {
      throw new DeploymentCompatibilityError(
        "IMPLEMENTATION_MISMATCH",
        `${path}.implementation`,
        "direct deployment (empty EIP-1967 implementation slot)",
        actual,
      );
    }
    return;
  }
  if (actual === null || actual.toLowerCase() !== expected.address.toLowerCase()) {
    throw new DeploymentCompatibilityError(
      "IMPLEMENTATION_MISMATCH",
      `${path}.implementation`,
      expected.address,
      actual ?? "missing storage",
    );
  }
  await assertCodeHash(client, `${path}.implementation`, expected.address, expected.runtimeCodeHash, blockNumber);
}

async function readEip1967Address(
  client: PublicClient,
  contract: Address,
  slot: Hex,
  blockNumber: bigint,
): Promise<Address | null> {
  const storage = await client.getStorageAt({ address: contract, slot, blockNumber });
  return storage && storage !== "0x" && BigInt(storage) !== 0n
    ? getAddress(`0x${storage.slice(-40)}`)
    : null;
}

function assertAddress(path: string, actual: Address, expected: Address): void {
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new DeploymentCompatibilityError("POINTER_MISMATCH", path, expected, actual);
  }
}
