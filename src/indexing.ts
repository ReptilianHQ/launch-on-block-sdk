import {
  getAddress,
  toEventSelector,
  toEventSignature,
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
} from "viem";
import {
  ABI_REVISION,
  feeControllerAbi,
  graduationPoolAbi,
  launchTokenAbi,
  launchpadAbi,
  routerAbi,
} from "./generated/abis.js";
import { deploymentManifest, getDeployment, listChains } from "./deployments.js";

export type IndexingContractName =
  | "Launchpad"
  | "Router"
  | "FeeController"
  | "LaunchToken"
  | "GraduationPool";

export interface IndexingEventParameter {
  name: string;
  type: string;
  indexed: boolean;
  semantic: string;
}

export interface IndexingEventDefinition {
  name: string;
  signature: string;
  topic0: Hex;
  description: string;
  parameters: readonly IndexingEventParameter[];
}

export interface IndexingContractDefinition {
  name: IndexingContractName;
  abiFile: string;
  sourceKind: "fixed" | "dynamic";
  discoveredBy: null | {
    contract: "Launchpad";
    event: "LaunchCreated" | "Graduated";
    addressParameter: "token" | "pool";
  };
  eventAbi: readonly AbiEvent[];
  events: readonly IndexingEventDefinition[];
}

export interface IndexingSource {
  contract: IndexingContractName;
  kind: "fixed" | "dynamic";
  address: Address | null;
  startBlock: number | null;
  discoveredBy: IndexingContractDefinition["discoveredBy"];
}

export interface IndexingNetworkManifest {
  schemaVersion: 1;
  coverage: "public_integration_events";
  caip2: `eip155:${number}`;
  chainId: number;
  network: string;
  deploymentId: string;
  releaseId: string;
  abiRevision: string;
  startBlock: number;
  sources: readonly IndexingSource[];
}

const descriptions: Record<string, string> = {
  "Launchpad.LaunchCreated": "A launch token and its creator payout terms were created.",
  "Launchpad.CurveAvailabilitySet": "Availability of a registered curve for new launches changed.",
  "Launchpad.CurveRegistered": "A curve implementation and reviewed code hash were registered.",
  "Launchpad.CurveSelected": "A launch token selected a curve implementation and quote target.",
  "Launchpad.Buy": "A buyer exchanged native quote value for launch tokens on the active curve.",
  "Launchpad.Sell": "A seller exchanged launch tokens for native quote value on the active curve.",
  "Launchpad.Graduated": "A launch completed its curve and allocated assets into its graduation pool.",
  "Launchpad.Claimed": "A pending native payout was claimed by its recipient.",
  "Router.Swap": "The protocol Router completed a swap through the selected pool.",
  "FeeController.FeesCollected": "Pool fees were collected and split between protocol and creator amounts.",
  "GraduationPool.Swap": "A graduation pool completed a token0/token1 swap.",
  "GraduationPool.ProtocolFeesCollected": "Accrued graduation-pool protocol fees were collected.",
  "LaunchToken.Approval": "An ERC-20 allowance was set.",
  "LaunchToken.Transfer": "Launch tokens moved between addresses, including mint and burn transfers.",
};

const semanticOverrides: Record<string, Record<string, string>> = {
  "Launchpad.LaunchCreated": { creatorBps: "basis_points", curveFeeBps: "basis_points", metadataURI: "uri" },
  "Launchpad.CurveSelected": { quoteTarget: "raw_native_quote_amount" },
  "Launchpad.Buy": { amountIn: "raw_native_quote_amount", tokensOut: "raw_launch_token_amount" },
  "Launchpad.Sell": { tokensIn: "raw_launch_token_amount", amountOut: "raw_native_quote_amount" },
  "Launchpad.Graduated": {
    totalRaised: "raw_native_quote_amount",
    creatorCut: "raw_native_quote_amount",
    protocolCut: "raw_native_quote_amount",
    poolQuote: "raw_native_quote_amount",
    poolTokens: "raw_launch_token_amount",
    burnedTokens: "raw_launch_token_amount",
  },
  "Launchpad.Claimed": { amount: "raw_native_quote_amount" },
  "Router.Swap": { amountIn: "raw_input_token_amount", amountOut: "raw_output_token_amount" },
  "FeeController.FeesCollected": {
    amount0: "raw_token0_amount",
    amount1: "raw_token1_amount",
    protocolAmount0: "raw_token0_amount",
    protocolAmount1: "raw_token1_amount",
    creatorAmount0: "raw_token0_amount",
    creatorAmount1: "raw_token1_amount",
  },
  "GraduationPool.Swap": {
    amount0In: "raw_token0_amount",
    amount1In: "raw_token1_amount",
    amount0Out: "raw_token0_amount",
    amount1Out: "raw_token1_amount",
  },
  "GraduationPool.ProtocolFeesCollected": { amount0: "raw_token0_amount", amount1: "raw_token1_amount" },
  "LaunchToken.Approval": { value: "raw_launch_token_amount" },
  "LaunchToken.Transfer": { value: "raw_launch_token_amount" },
};

const definitions: ReadonlyArray<{
  name: IndexingContractName;
  abi: Abi;
  sourceKind: "fixed" | "dynamic";
  discoveredBy: IndexingContractDefinition["discoveredBy"];
}> = [
  { name: "Launchpad", abi: launchpadAbi, sourceKind: "fixed", discoveredBy: null },
  { name: "Router", abi: routerAbi, sourceKind: "fixed", discoveredBy: null },
  { name: "FeeController", abi: feeControllerAbi, sourceKind: "fixed", discoveredBy: null },
  {
    name: "LaunchToken",
    abi: launchTokenAbi,
    sourceKind: "dynamic",
    discoveredBy: { contract: "Launchpad", event: "LaunchCreated", addressParameter: "token" },
  },
  {
    name: "GraduationPool",
    abi: graduationPoolAbi,
    sourceKind: "dynamic",
    discoveredBy: { contract: "Launchpad", event: "Graduated", addressParameter: "pool" },
  },
];

export const launchOnBlockEventCatalog = deepFreeze({
  schemaVersion: 1 as const,
  coverage: "public_integration_events" as const,
  abiRevision: ABI_REVISION,
  contracts: definitions.map(({ name, abi, sourceKind, discoveredBy }): IndexingContractDefinition => {
    const eventAbi = abi.filter((item): item is AbiEvent => item.type === "event");
    return {
      name,
      abiFile: `abis/${name}.events.json`,
      sourceKind,
      discoveredBy,
      eventAbi,
      events: eventAbi.map((event) => {
        const key = `${name}.${event.name}`;
        return {
          name: event.name,
          signature: toEventSignature(event),
          topic0: toEventSelector(event),
          description: descriptions[key] ?? `${name} emitted ${event.name}.`,
          parameters: event.inputs.map((input) => {
            if (!input.name) throw new Error(`${key} contains an unnamed event parameter`);
            return {
              name: input.name,
              type: input.type,
              indexed: input.indexed ?? false,
              semantic: semanticOverrides[key]?.[input.name] ?? defaultSemantic(input.type),
            };
          }),
        };
      }),
    };
  }),
});

export function getIndexingManifest(chainId: number): IndexingNetworkManifest {
  const deployment = getDeployment(chainId);
  const raw = Object.values(deploymentManifest.robinhood).find((candidate) => candidate.chain_id === chainId);
  if (!raw || !raw.contracts) throw new Error(`Deployment metadata is incomplete for chain ${chainId}`);
  const addresses: Record<"Launchpad" | "Router" | "FeeController", Address> = {
    Launchpad: getAddress(deployment.contracts.launchpad),
    Router: getAddress(deployment.contracts.router),
    FeeController: getAddress(deployment.contracts.feeController),
  };
  return deepFreeze({
    schemaVersion: 1,
    coverage: "public_integration_events",
    caip2: `eip155:${chainId}`,
    chainId,
    network: raw.id,
    deploymentId: `${chainId}:launchpad:${deployment.contracts.launchpad.toLowerCase()}:${deployment.contracts.startBlock}`,
    releaseId: deployment.contracts.releaseId,
    abiRevision: deployment.contracts.abiRevision,
    startBlock: deployment.contracts.startBlock,
    sources: launchOnBlockEventCatalog.contracts.map((contract): IndexingSource => ({
      contract: contract.name,
      kind: contract.sourceKind,
      address: contract.sourceKind === "fixed"
        ? addresses[contract.name as keyof typeof addresses]
        : null,
      startBlock: contract.sourceKind === "fixed" ? deployment.contracts.startBlock : null,
      discoveredBy: contract.discoveredBy,
    })),
  });
}

export function listIndexingManifests(): readonly IndexingNetworkManifest[] {
  return listChains()
    .filter((chain) => chain.contracts !== null)
    .map((chain) => getIndexingManifest(chain.chainId));
}

function defaultSemantic(type: string): string {
  if (type === "address") return "address";
  if (type === "bool") return "boolean";
  if (type === "bytes32") return "hash";
  if (type === "string") return "text";
  if (type.startsWith("uint") || type.startsWith("int")) return "integer";
  return "abi_value";
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
