import { describe, expect, it } from "vitest";
import {
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  getAddress,
  keccak256,
  toEventSelector,
  toFunctionSelector,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import {
  ABI_REVISION,
  ROBINHOOD_CHAIN_ID,
  ROBINHOOD_CHAIN_TESTNET_ID,
  ROBINHOOD_MAINNET_LAUNCHPAD_ADDRESS,
  ROBINHOOD_MAINNET_LAUNCHPAD_START_BLOCK,
  DeploymentCompatibilityError,
  assertCompatibleDeployment,
  abiSignatures,
  buildCreateLaunchTransaction,
  buildCurveBuyTransaction,
  buildSwapExactInTransaction,
  decodeLaunchpadTransaction,
  decodeRouterTransaction,
  deploymentManifest,
  getDeployment,
  launchpadAbi,
  robinhoodMainnet,
  routerAbi,
  parseRpcTransactionRequest,
  toRpcTransactionRequest,
  verifyBuyReceipt,
  verifyCreateLaunchTransaction,
  verifyCurveBuyTransaction,
  verifyCurveSelectedReceipt,
  verifyLaunchCreationReceipt,
  verifyLaunchCreatedReceipt,
  type Deployment,
  type ProtocolContracts,
} from "./index.js";

const launchpad = getAddress("0x9fe4f17b53a520c4c8672c945285574a7396340f");
const account = getAddress("0x0000000000000000000000000000000000000001");
const token = getAddress("0x2222222222222222222222222222222222222222");
const implementationSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const adminSlot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

const createParameters = {
  name: "Gecko",
  symbol: "GECKO",
  creatorBps: 0,
  curveFeeBps: 100,
  payoutWallet: account,
  metadataUri: "ipfs://metadata",
} as const;

describe("deployment manifest", () => {
  it("exposes the canonical generation and complete mainnet deployment", () => {
    const deployment = getDeployment(ROBINHOOD_CHAIN_ID);
    const completeMainnet: Deployment & { contracts: ProtocolContracts } = robinhoodMainnet;
    expect(deployment.contracts).toMatchObject({
      generation: "gen-12",
      startBlock: 17_957_183,
      launchpad: "0x135492b3ccb2cb64749f91332f929f49a1deed3f",
      launchpadType: "immutable",
      defaultCurve: { id: 1, address: "0xed51fb775a87931a9a92b3ac2191f757e66c8685" },
    });
    expect(deployment.contracts.releaseId).toBe("gen-12");
    expect(deployment.contracts.abiRevision).toBe(ABI_REVISION);
    expect(ROBINHOOD_MAINNET_LAUNCHPAD_ADDRESS).toBe(deployment.contracts.launchpad);
    expect(ROBINHOOD_MAINNET_LAUNCHPAD_START_BLOCK).toBe(deployment.contracts.startBlock);
    expect(completeMainnet.contracts.launchpad).toBe(deployment.contracts.launchpad);
  });

  it("exposes the canonical generation and complete testnet deployment", () => {
    const deployment = getDeployment(ROBINHOOD_CHAIN_TESTNET_ID);
    expect(deployment.contracts).toMatchObject({
      generation: "gen-12",
      startBlock: 92_793_378,
      launchpad: "0x9fe4f17b53a520c4c8672c945285574a7396340f",
      launchpadType: "immutable",
      defaultCurve: { id: 1, address: "0xc8ee86322d7cc309b430432845dc586cdf34cecf" },
    });
    expect(deployment.addresses.wNative).toBe("0x7943e237c7F95DA44E0301572D358911207852Fa");
    expect(deployment.contracts.releaseId).toBe("gen-12");
    expect(deployment.contracts.abiRevision).toBe(ABI_REVISION);
  });

  it("exposes deeply immutable canonical deployment values", () => {
    const deployment = getDeployment(ROBINHOOD_CHAIN_TESTNET_ID);
    expect(Object.isFrozen(deployment)).toBe(true);
    expect(Object.isFrozen(deployment.contracts.runtimeCodeHashes)).toBe(true);
    expect(Object.isFrozen(deploymentManifest.robinhood.testnet.contracts)).toBe(true);
    expect(() => {
      (deployment.contracts as { router: Address }).router = token;
    }).toThrow(TypeError);
    expect(getDeployment(ROBINHOOD_CHAIN_TESTNET_ID).contracts.router).not.toBe(token);
  });
});

describe("executable deployment compatibility", () => {
  const bytecode = "0x6000" as const;
  const codeHash = keccak256(bytecode);

  function fixture(options: {
    wrongPointer?: boolean;
    wrongRouterLaunchpad?: boolean;
    missingFeeControllerLbFactory?: boolean;
    launchpadProxyStorage?: boolean;
    wrongImplementation?: boolean;
    wrongAdmin?: boolean;
    wrongLaunchpadMetadata?: boolean;
    wrongLaunchpadType?: boolean;
    wrongChain?: boolean;
    missingCodeAt?: Address;
  } = {}) {
    const base = getDeployment(ROBINHOOD_CHAIN_TESTNET_ID);
    const feeControllerImplementation = getAddress("0x0000000000000000000000000000000000000012");
    const deployment: Deployment & { contracts: ProtocolContracts } = {
      ...base,
      contracts: {
        ...base.contracts,
        launchpadType: (options.wrongLaunchpadType ? "transparent_proxy" : "immutable") as "immutable",
        runtimeCodeHashes: {
          launchpad: codeHash,
          feeController: codeHash,
          router: codeHash,
          lbFactory: codeHash,
          lbPairImplementation: codeHash,
          lbRouter: codeHash,
          curveId1: codeHash,
          poolDeployer: codeHash,
          escrowDeployer: codeHash,
          escrowImplementation: codeHash,
          proxyUpgradeGate: codeHash,
          feeControllerAdmin: codeHash,
        },
        feeControllerAdmin: { ...base.contracts.feeControllerAdmin, runtimeCodeHash: codeHash },
        defaultCurve: { ...base.contracts.defaultCurve, runtimeCodeHash: codeHash },
        graduationPoolDeployer: { ...base.contracts.graduationPoolDeployer, runtimeCodeHash: codeHash },
        launchEscrowDeployer: {
          ...base.contracts.launchEscrowDeployer,
          runtimeCodeHash: codeHash,
          implementation: { ...base.contracts.launchEscrowDeployer.implementation, runtimeCodeHash: codeHash },
        },
        proxyUpgradeGate: { ...base.contracts.proxyUpgradeGate, runtimeCodeHash: codeHash },
        implementations: {
          launchpad: (options.wrongLaunchpadMetadata
            ? { address: token, runtimeCodeHash: codeHash }
            : null) as null,
          feeController: { address: feeControllerImplementation, runtimeCodeHash: codeHash },
        },
      },
    };
    const { contracts } = deployment;
    const pointerEntries: Array<[string, Address]> = [
      [`${contracts.launchpad}:feeController`, contracts.feeController],
      [`${contracts.launchpad}:wNative`, deployment.addresses.wNative as Address],
      [`${contracts.launchpad}:governance`, account],
      [`${contracts.launchpad}:graduationPoolDeployer`, contracts.graduationPoolDeployer.address],
      [`${contracts.launchpad}:launchEscrowDeployer`, contracts.launchEscrowDeployer.address],
      [`${contracts.launchpad}:curveImplementation`, contracts.defaultCurve.address],
      [`${contracts.launchEscrowDeployer.address}:implementation`, contracts.launchEscrowDeployer.implementation.address],
      [`${contracts.feeController}:launchpad`, contracts.launchpad],
      [`${contracts.feeController}:lbFactory`, options.missingFeeControllerLbFactory
        ? getAddress("0x0000000000000000000000000000000000000000")
        : contracts.lbFactory],
      [`${contracts.router}:launchpad`, options.wrongRouterLaunchpad ? token : contracts.launchpad],
      [`${contracts.router}:lbFactory`, contracts.lbFactory],
      [`${contracts.router}:wNative`, deployment.addresses.wNative as Address],
      [`${contracts.lbFactory}:getFeeRecipient`, options.wrongPointer ? token : contracts.feeController],
      [`${contracts.lbFactory}:getLBPairImplementation`, contracts.lbPairImplementation],
      [`${contracts.lbRouter}:getFactory`, contracts.lbFactory],
      [`${contracts.lbRouter}:getWNATIVE`, deployment.addresses.wNative as Address],
      [`${contracts.feeControllerAdmin.address}:owner`, contracts.proxyUpgradeGate.address],
      [`${contracts.proxyUpgradeGate.address}:timelock`, account],
    ];
    const values = new Map<string, Address | number>(pointerEntries.map(([key, value]) => [key.toLowerCase(), value]));
    values.set(`${contracts.launchpad}:DEFAULT_CURVE_ID`.toLowerCase(), contracts.defaultCurve.id);
    const observedBlocks: bigint[] = [];
    const client = {
      getChainId: async () => options.wrongChain ? deployment.chainId + 1 : deployment.chainId,
      getBlock: async () => ({ number: 123n }),
      getBytecode: async ({ address, blockNumber }: { address: Address; blockNumber?: bigint }) => {
        if (blockNumber !== undefined) observedBlocks.push(blockNumber);
        return options.missingCodeAt?.toLowerCase() === address.toLowerCase() ? undefined : bytecode;
      },
      getStorageAt: async ({
        address,
        slot,
        blockNumber,
      }: { address: Address; slot: Hex; blockNumber?: bigint }) => {
        if (blockNumber !== undefined) observedBlocks.push(blockNumber);
        if (slot !== implementationSlot && slot !== adminSlot) throw new Error(`unexpected storage slot ${slot}`);
        const isImplementationSlot = slot === implementationSlot;
        let actual: Address | null = null;
        if (address.toLowerCase() === contracts.launchpad.toLowerCase()) {
          if (isImplementationSlot && options.launchpadProxyStorage) actual = token;
        } else if (address.toLowerCase() === contracts.feeController.toLowerCase()) {
          actual = isImplementationSlot
            ? options.wrongImplementation ? token : feeControllerImplementation
            : options.wrongAdmin ? token : contracts.feeControllerAdmin.address;
        }
        if (actual === null) return undefined;
        return `0x${"0".repeat(24)}${actual.slice(2)}` as Hex;
      },
      readContract: async ({
        address,
        functionName,
        blockNumber,
      }: { address: Address; functionName: string; blockNumber?: bigint }) => {
        if (blockNumber !== undefined) observedBlocks.push(blockNumber);
        const value = values.get(`${address}:${functionName}`.toLowerCase());
        if (!value) throw new Error(`unexpected read ${address}:${functionName}`);
        return value;
      },
    } as unknown as PublicClient;
    return { client, deployment, observedBlocks };
  }

  it("proves bytecode, optional proxy implementations, and the complete pointer graph", async () => {
    const compatible = fixture();
    await expect(assertCompatibleDeployment(compatible.client, compatible.deployment)).resolves.toMatchObject({
      chainId: ROBINHOOD_CHAIN_TESTNET_ID,
      releaseId: "gen-12",
      abiRevision: ABI_REVISION,
      blockNumber: 123n,
    });
    expect(compatible.observedBlocks.length).toBeGreaterThan(0);
    expect(compatible.observedBlocks.every((block) => block === 123n)).toBe(true);
  });

  it("fails closed on the historically recurring LBFactory fee-recipient mismatch", async () => {
    const { client, deployment } = fixture({ wrongPointer: true });
    await expect(assertCompatibleDeployment(client, deployment)).rejects.toMatchObject({
      code: "POINTER_MISMATCH",
      path: "pointers.lbFactoryFeeRecipient",
    } satisfies Partial<DeploymentCompatibilityError>);
  });

  it("fails closed before pointer reads when deployed bytecode drifts", async () => {
    const { client, deployment } = fixture();
    (deployment.contracts.runtimeCodeHashes as { router: Hex }).router = `0x${"00".repeat(32)}`;
    await expect(assertCompatibleDeployment(client, deployment)).rejects.toMatchObject({
      code: "CODE_HASH_MISMATCH",
      path: "contracts.router",
    } satisfies Partial<DeploymentCompatibilityError>);
  });

  it("fails closed when proxy storage exists but implementations are omitted", async () => {
    const { client, deployment } = fixture({ launchpadProxyStorage: true });
    await expect(assertCompatibleDeployment(client, deployment)).rejects.toMatchObject({
      code: "IMPLEMENTATION_MISMATCH",
      path: "contracts.launchpad.implementation",
      expected: "direct deployment (empty EIP-1967 implementation slot)",
    } satisfies Partial<DeploymentCompatibilityError>);
  });

  it("fails closed on contradictory immutable Launchpad metadata", async () => {
    const topology = fixture({ wrongLaunchpadType: true });
    await expect(assertCompatibleDeployment(topology.client, topology.deployment)).rejects.toMatchObject({
      code: "IMPLEMENTATION_MISMATCH",
      path: "contracts.launchpadType",
    });

    const implementation = fixture({ wrongLaunchpadMetadata: true });
    await expect(assertCompatibleDeployment(implementation.client, implementation.deployment)).rejects.toMatchObject({
      code: "IMPLEMENTATION_MISMATCH",
      path: "contracts.launchpad.implementation",
    });
  });

  it("classifies ABI, chain, missing-code, and implementation identity mismatches", async () => {
    const abi = fixture();
    const wrongAbi = {
      ...abi.deployment,
      contracts: { ...abi.deployment.contracts, abiRevision: "sha256:wrong" },
    } as Deployment & { contracts: ProtocolContracts };
    await expect(assertCompatibleDeployment(abi.client, wrongAbi)).rejects.toMatchObject({
      code: "ABI_REVISION_MISMATCH",
    });

    const chain = fixture({ wrongChain: true });
    await expect(assertCompatibleDeployment(chain.client, chain.deployment)).rejects.toMatchObject({
      code: "CHAIN_MISMATCH",
    });

    const missing = fixture({ missingCodeAt: getDeployment(ROBINHOOD_CHAIN_TESTNET_ID).contracts.router });
    await expect(assertCompatibleDeployment(missing.client, missing.deployment)).rejects.toMatchObject({
      code: "CODE_MISSING",
      path: "contracts.router",
    });

    const implementation = fixture({ wrongImplementation: true });
    await expect(assertCompatibleDeployment(implementation.client, implementation.deployment)).rejects.toMatchObject({
      code: "IMPLEMENTATION_MISMATCH",
      path: "contracts.feeController.implementation",
    });

    const admin = fixture({ wrongAdmin: true });
    await expect(assertCompatibleDeployment(admin.client, admin.deployment)).rejects.toMatchObject({
      code: "ADMIN_MISMATCH",
      path: "contracts.feeController.admin",
    });
  });

  it("fails closed on the known transition Router and FeeController LB mismatches", async () => {
    const router = fixture({ wrongRouterLaunchpad: true });
    await expect(assertCompatibleDeployment(router.client, router.deployment)).rejects.toMatchObject({
      code: "POINTER_MISMATCH",
      path: "pointers.routerLaunchpad",
    });

    const feeController = fixture({ missingFeeControllerLbFactory: true });
    await expect(assertCompatibleDeployment(feeController.client, feeController.deployment)).rejects.toMatchObject({
      code: "POINTER_MISMATCH",
      path: "pointers.feeControllerLbFactory",
    });
  });
});

describe("generated ABI subsets", () => {
  it("contains every read, simulation, calldata, and receipt entry required by downstream consumers", () => {
    const names = new Set<string | undefined>(launchpadAbi.map((item) => "name" in item ? item.name : undefined));
    for (const name of [
      "launches", "quoteBuy", "buy", "createLaunch", "MIN_CURVE_FEE_BPS",
      "MAX_CURVE_FEE_BPS", "maxGraduationCutBps", "protocolCutBps", "raiseThreshold",
      "curveImplementation", "escrowOf", "CurveSelected", "LaunchCreated", "Buy",
    ]) expect(names.has(name)).toBe(true);
  });

  it("pins exact downstream-critical signatures, selectors, and event topics", () => {
    const create = "createLaunch(string,string,uint16,uint16,address,string)";
    const buy = "buy(address,uint256)";
    const launchCreated = "LaunchCreated(address,address,uint16,uint16,address,string)";
    const buyEvent = "Buy(address,address,uint256,uint256)";
    const curveCreate = "createLaunch(string,string,uint16,uint16,address,string,uint32)";
    const curveSelected = "CurveSelected(address,uint32,address,uint256)";

    expect(abiSignatures.launchpadAbi).toContain(`function ${create}`);
    expect(abiSignatures.launchpadAbi).toContain(`function ${buy}`);
    expect(abiSignatures.launchpadAbi).toContain(`event ${launchCreated}`);
    expect(abiSignatures.launchpadAbi).toContain(`event ${buyEvent}`);
    expect(abiSignatures.launchpadAbi).toContain(`function ${curveCreate}`);
    expect(abiSignatures.launchpadAbi).toContain(`event ${curveSelected}`);
    expect(toFunctionSelector(create)).toBe("0x019ffac1");
    expect(toFunctionSelector(buy)).toBe("0xcce7ec13");
    expect(toEventSelector(launchCreated)).toBe("0xae76055728f8aa67cf9f5fb3080ad262991120b513b585fe5b4f1b211ea84321");
    expect(toEventSelector(buyEvent)).toBe("0x89f5adc174562e07c9c9b1cae7109bbecb21cf9d1b2847e550042b8653c54a0e");
    expect(toFunctionSelector(curveCreate)).toBe("0xb2c78e54");
    expect(toEventSelector(curveSelected)).toBe("0x93d0ea63035b087d509c5205e9955afee7efa90be606c4750371bf020b992c8f");
  });
});

describe("transaction requests and calldata verification", () => {
  it("builds and decodes create calldata and verifies its authorization envelope", () => {
    const request = buildCreateLaunchTransaction(launchpad, createParameters);
    expect(decodeLaunchpadTransaction(request.data)).toMatchObject({
      functionName: "createLaunch",
      args: ["Gecko", "GECKO", 0, 100, account, "ipfs://metadata"],
    });
    expect(verifyCreateLaunchTransaction({
      from: account,
      to: launchpad,
      value: 0n,
      input: request.data,
    }, launchpad, account, createParameters).functionName).toBe("createLaunch");
    expect(() => verifyCreateLaunchTransaction({
      from: account,
      to: launchpad,
      value: 1n,
      input: request.data,
    }, launchpad, account, createParameters)).toThrow(/value/i);
  });

  it("builds every default, curve-selected, and vanity create overload", () => {
    const curve = buildCreateLaunchTransaction(launchpad, { ...createParameters, curveId: 1 });
    expect(decodeLaunchpadTransaction(curve.data)).toMatchObject({
      functionName: "createLaunch",
      args: ["Gecko", "GECKO", 0, 100, account, "ipfs://metadata", 1],
    });

    const salt = `0x${"01".repeat(32)}` as Hex;
    const vanity = buildCreateLaunchTransaction(launchpad, { ...createParameters, salt });
    expect(decodeLaunchpadTransaction(vanity.data)).toMatchObject({ functionName: "createLaunchVanity" });
    const vanityCurve = buildCreateLaunchTransaction(launchpad, { ...createParameters, salt, curveId: 1 });
    expect(decodeLaunchpadTransaction(vanityCurve.data)).toMatchObject({
      functionName: "createLaunchVanity",
      args: ["Gecko", "GECKO", 0, 100, account, "ipfs://metadata", salt, 1],
    });
    expect(() => buildCreateLaunchTransaction(launchpad, { ...createParameters, curveId: 0 })).toThrow(/curveId/i);
    expect(() => buildCreateLaunchTransaction(launchpad, {
      ...createParameters,
      salt: `0x${"00".repeat(32)}` as Hex,
    })).toThrow(/salt/i);
  });

  it("rejects read-only calldata instead of returning a value outside the decoder's declared union", () => {
    const quoteBuy = encodeFunctionData({
      abi: launchpadAbi,
      functionName: "quoteBuy",
      args: [token, 10n],
    });
    expect(() => decodeLaunchpadTransaction(quoteBuy)).toThrow(/Unsupported Launchpad transaction function: quoteBuy/);

    const nativeConstant = encodeFunctionData({ abi: routerAbi, functionName: "NATIVE" });
    expect(() => decodeRouterTransaction(nativeConstant)).toThrow(/Unsupported Router transaction function: NATIVE/);
  });

  it("verifies buy target, sender, value, token, and protected minimum through exact calldata", () => {
    const request = buildCurveBuyTransaction(launchpad, { token, minTokensOut: 1_980n, value: 10n });
    expect(verifyCurveBuyTransaction({
      from: account,
      to: launchpad,
      value: 10n,
      input: request.data,
    }, launchpad, account, { token, minTokensOut: 1_980n, value: 10n }).functionName).toBe("buy");
    expect(() => verifyCurveBuyTransaction({
      from: account,
      to: launchpad,
      value: 10n,
      input: request.data,
    }, launchpad, account, { token, minTokensOut: 1_981n, value: 10n })).toThrow(/calldata/i);
  });

  it("round-trips the strict JSON-RPC wallet request shape", () => {
    const request = toRpcTransactionRequest(
      buildCurveBuyTransaction(launchpad, { token, minTokensOut: 1_980n, value: 10n }),
      150_000n,
    );
    expect(parseRpcTransactionRequest(request)).toEqual(request);
    expect(() => parseRpcTransactionRequest({ ...request, data: "0xabc" })).toThrow(/calldata/i);
  });

  it("rejects a zero recipient before encoding a Router swap", () => {
    expect(() => buildSwapExactInTransaction(
      getAddress("0x0000000000000000000000000000000000000010"),
      {
        tokenIn: token,
        tokenOut: getAddress("0x0000000000000000000000000000000000000020"),
        amountIn: 1n,
        amountOutMin: 1n,
        recipient: getAddress("0x0000000000000000000000000000000000000000"),
        deadline: 1n,
      },
    )).toThrow(/zero address/i);
  });
});

describe("receipt verification", () => {
  function log(eventName: "LaunchCreated" | "CurveSelected" | "Buy", args: Record<string, unknown>, data: Hex, address: Address = launchpad) {
    return {
      address,
      topics: encodeEventTopics({ abi: launchpadAbi, eventName, args: args as never }) as readonly Hex[],
      data,
    };
  }

  it("requires exact create evidence from the configured launchpad", () => {
    const receipt = {
      status: "success" as const,
      logs: [log("LaunchCreated", { token, creator: account }, encodeAbiParameters(
        [{ type: "uint16" }, { type: "uint16" }, { type: "address" }, { type: "string" }],
        [0, 100, account, "ipfs://metadata"],
      ))],
    };
    expect(verifyLaunchCreatedReceipt(receipt, launchpad, {
      token,
      creator: account,
      creatorBps: 0,
      curveFeeBps: 100,
      payoutWallet: account,
      metadataURI: "ipfs://metadata",
    }).token).toBe(token);
    expect(() => verifyLaunchCreatedReceipt(receipt, launchpad, { metadataURI: "IPFS://metadata" })).toThrow(/metadataURI/i);
  });

  it("requires the curve selection event and binds both creation events to one token", () => {
    const implementation = getAddress("0x3333333333333333333333333333333333333333");
    const launchLog = log("LaunchCreated", { token, creator: account }, encodeAbiParameters(
      [{ type: "uint16" }, { type: "uint16" }, { type: "address" }, { type: "string" }],
      [0, 100, account, "ipfs://metadata"],
    ));
    const curveLog = log("CurveSelected", { token, curveId: 1, implementation }, encodeAbiParameters(
      [{ type: "uint256" }],
      [4_160_000_000_000_000_000n],
    ));
    const receipt = { status: "success" as const, logs: [launchLog, curveLog] };
    expect(verifyCurveSelectedReceipt(receipt, launchpad, {
      token,
      curveId: 1,
      implementation,
    }).quoteTarget).toBe(4_160_000_000_000_000_000n);
    expect(verifyLaunchCreationReceipt(receipt, launchpad, {
      launch: { token, creator: account },
      curve: { token, curveId: 1, implementation },
    }).curve.curveId).toBe(1);

    const otherToken = getAddress("0x4444444444444444444444444444444444444444");
    const mismatchedCurveLog = log("CurveSelected", { token: otherToken, curveId: 1, implementation }, encodeAbiParameters(
      [{ type: "uint256" }],
      [1n],
    ));
    expect(() => verifyLaunchCreationReceipt(
      { status: "success", logs: [launchLog, mismatchedCurveLog] },
      launchpad,
    )).toThrow(/disagree on token/i);
  });

  it("binds buy evidence to emitter, account, amount, and minimum output", () => {
    const data = encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [10n, 2_000n]);
    const receipt = { status: "success" as const, logs: [log("Buy", { token, buyer: account }, data)] };
    expect(verifyBuyReceipt(receipt, launchpad, {
      token,
      buyer: account,
      amountIn: 10n,
      minTokensOut: 1_980n,
    }).tokensOut).toBe(2_000n);
    expect(() => verifyBuyReceipt(receipt, launchpad, { minTokensOut: 2_001n })).toThrow(/minimum/i);
    expect(() => verifyBuyReceipt({ ...receipt, logs: [{ ...receipt.logs[0], address: token }] }, launchpad)).toThrow(/Expected Buy/i);
    expect(() => verifyBuyReceipt({ ...receipt, status: "reverted" }, launchpad)).toThrow(/reverted/i);
  });
});
