import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchOnBlockEventCatalog, listIndexingManifests } from "../dist/indexing.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

if (mode !== "--write" && mode !== "--check") {
  throw new Error("usage: node scripts/indexing-artifacts.mjs --write|--check");
}

const manifests = listIndexingManifests();
const publicCatalog = {
  schemaVersion: launchOnBlockEventCatalog.schemaVersion,
  coverage: launchOnBlockEventCatalog.coverage,
  abiRevision: launchOnBlockEventCatalog.abiRevision,
  contracts: launchOnBlockEventCatalog.contracts.map(({ eventAbi: _eventAbi, ...contract }) => contract),
  networks: manifests,
};

const artifacts = new Map([
  ["indexing/manifest.json", json({ $schema: "./manifest.schema.json", ...publicCatalog })],
  ["indexing/manifest.schema.json", json(indexingManifestSchema())],
  ["indexing/README.md", indexingReadme()],
  ["examples/envio/config.yaml", envioConfig(manifests)],
  ["examples/envio/package.json", json(envioPackage())],
  ["examples/envio/README.md", envioReadme()],
  ["examples/envio/schema.graphql", envioSchema()],
  ["examples/envio/src/EventHandlers.ts", envioHandlers()],
  ["examples/graph/networks.json", json(graphNetworks(manifests))],
  ["examples/graph/package.json", json(graphPackage())],
  ["examples/graph/README.md", graphReadme()],
  ["examples/graph/schema.graphql", graphSchema()],
]);

for (const contract of launchOnBlockEventCatalog.contracts) {
  artifacts.set(`indexing/${contract.abiFile}`, json(contract.eventAbi));
  artifacts.set(`examples/graph/src/${contract.name}.ts`, graphMapping(contract));
}
for (const manifest of manifests) {
  artifacts.set(`examples/graph/subgraph.${graphNetworkSlug(manifest)}.yaml`, graphManifest(manifest));
}

if (mode === "--write") {
  rmSync(resolve(root, "indexing"), { recursive: true, force: true });
  rmSync(resolve(root, "examples", "envio"), { recursive: true, force: true });
  rmSync(resolve(root, "examples", "graph"), { recursive: true, force: true });
  for (const [relativePath, content] of artifacts) {
    const path = resolve(root, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  console.log(`generated ${artifacts.size} indexing artifacts`);
} else {
  const drift = [];
  for (const [relativePath, expected] of artifacts) {
    const path = resolve(root, relativePath);
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) drift.push(relativePath);
  }
  const generatedRoots = [resolve(root, "indexing"), resolve(root, "examples", "envio"), resolve(root, "examples", "graph")];
  const expectedPaths = new Set(artifacts.keys());
  for (const generatedRoot of generatedRoots) {
    for (const path of listFiles(generatedRoot)) {
      const relativePath = path.slice(root.length + 1);
      if (!expectedPaths.has(relativePath)) drift.push(relativePath);
    }
  }
  if (drift.length > 0) throw new Error(`indexing artifacts are stale, missing, or unexpected: ${drift.join(", ")}`);
  console.log(`verified ${artifacts.size} indexing artifacts`);
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function indexingReadme() {
  return `# Launch On Block public indexing boundary

This directory is the stable, vendor-neutral indexing surface published with
\`@reptilianhq/launch-on-block-sdk\`. It contains the public integration events intentionally supported
for third-party consumers; it is not an inventory of every implementation or administrative event.

- \`manifest.json\`: chain identities, deployment boundaries, event topics, decoded parameters, value
  semantics, and dynamic source discovery.
- \`manifest.schema.json\`: complete JSON Schema for validating the manifest.
- \`abis/*.events.json\`: minimal event-only ABIs.

Use chain ID, block hash/number, transaction hash/index, log index, and emitter address as event
provenance. Handle reorgs and begin each fixed source at its declared start block. Dynamic sources begin
at \`LaunchCreated.token\` and \`Graduated.pool\`; initial lifecycle state belongs to those discovery
events because a newly registered source may not replay earlier logs from the same transaction.

Amounts are raw integers. Their \`semantic\` labels identify units, but pricing, decimal normalization,
valuation, attribution, confirmation policy, and storage design belong to the consumer.

Complete Envio and The Graph starters live in the repository's \`examples/\` directory. They are
generated and drift-checked, but intentionally are not part of the npm package API.
`;
}

function envioConfig(networks) {
  const contracts = launchOnBlockEventCatalog.contracts.map((contract) => [
    `  - name: ${contract.name}`,
    `    abi_file_path: ../../indexing/${contract.abiFile}`,
    "    events:",
    ...contract.events.map((event) => `      - event: ${event.name}`),
  ].join("\n")).join("\n");
  const chains = networks.map((network) => {
    const fixed = network.sources.filter((source) => source.kind === "fixed");
    return [
      `  - id: ${network.chainId}`,
      `    start_block: ${network.startBlock}`,
      "    contracts:",
      ...fixed.flatMap((source) => [
        `      - name: ${source.contract}`,
        `        start_block: ${source.startBlock}`,
        "        address:",
        `          - "${source.address.toLowerCase()}"`,
      ]),
    ].join("\n");
  }).join("\n");
  return `# yaml-language-server: $schema=./node_modules/envio/evm.schema.json
# Generated from the SDK public indexing boundary. Add RPC/provider policy for your environment.
name: launch-on-block-public-events
description: Decoded Launch On Block public integration events.
rollback_on_reorg: true
raw_events: false
address_format: lowercase

contracts:
${contracts}

chains:
${chains}
`;
}

function envioSchema() {
  return `${entitySchema("envio")}\n`;
}

function envioPackage() {
  return {
    private: true,
    type: "module",
    scripts: {
      codegen: "envio codegen",
      start: "envio dev",
    },
    dependencies: { envio: "3.2.1" },
  };
}

function envioReadme() {
  return `# Envio starter

This example stores one immutable decoded entity per public event and dynamically registers launch
tokens and graduation pools. It is generated from the SDK catalog.

1. Copy this directory together with the repository's \`indexing/\` directory, preserving their relative
   paths.
2. Add your Robinhood RPC configuration and confirmation/reorg policy to \`config.yaml\`.
3. Run \`npm install && npm run codegen\`, then \`npm start\`.

The schema is deliberately event-shaped. Build pricing, liquidity, valuation, and application read
models separately so raw protocol amounts are never silently presented as priced values.
`;
}

function envioHandlers() {
  const handlers = launchOnBlockEventCatalog.contracts.flatMap((contract) => contract.events.map((event) => {
    const entity = entityName(contract, event);
    const registrations = contract.name === "Launchpad" && event.name === "LaunchCreated"
      ? "\n    context.chain.LaunchToken.add(event.params.token);"
      : contract.name === "Launchpad" && event.name === "Graduated"
        ? "\n    context.chain.GraduationPool.add(event.params.pool);"
        : "";
    return `indexer.onEvent({ contract: "${contract.name}", event: "${event.name}" }, async ({ event, context }) => {
  context.${entity}.set({
    ...metadata(event),
${event.parameters.map((parameter) => `    ${parameter.name}: ${envioValue(parameter)},`).join("\n")}
  });${registrations}
});`;
  })).join("\n\n");
  return `// Generated runnable starter. Copy the example before adding application-specific entities.
import { indexer } from "envio";

function metadata(event: {
  chainId: number;
  srcAddress: string;
  block: { number: number; hash: string; timestamp: number };
  transaction: { hash?: string; transactionIndex?: number };
  logIndex: number;
}) {
  return {
    id: \`${"${event.chainId}-${event.block.number}-${event.logIndex}"}\`,
    chainId: BigInt(event.chainId),
    emitter: event.srcAddress,
    blockNumber: BigInt(event.block.number),
    blockHash: event.block.hash,
    blockTimestamp: BigInt(event.block.timestamp),
    transactionHash: event.transaction.hash ?? "",
    transactionIndex: BigInt(event.transaction.transactionIndex ?? 0),
    logIndex: BigInt(event.logIndex),
  };
}

${handlers}
`;
}

function envioValue(parameter) {
  if (parameter.type.startsWith("uint") || parameter.type.startsWith("int")) {
    return `BigInt(event.params.${parameter.name})`;
  }
  return `event.params.${parameter.name}`;
}

function graphNetworks(networks) {
  return Object.fromEntries(networks.map((network) => [graphNetworkSlug(network), {
    chainId: network.chainId,
    caip2: network.caip2,
    graphNetwork: network.network,
    deploymentId: network.deploymentId,
    releaseId: network.releaseId,
    startBlock: network.startBlock,
  }]));
}

function graphPackage() {
  return {
    private: true,
    scripts: {
      "codegen:mainnet": "graph codegen subgraph.mainnet.yaml",
      "codegen:testnet": "graph codegen subgraph.testnet.yaml",
      "build:mainnet": "graph build subgraph.mainnet.yaml",
      "build:testnet": "graph build subgraph.testnet.yaml",
    },
    dependencies: { "@graphprotocol/graph-ts": "0.38.2" },
    devDependencies: { "@graphprotocol/graph-cli": "0.98.1" },
  };
}

function graphReadme() {
  return `# The Graph starter

This example stores every decoded public event parameter in immutable entities and registers dynamic
launch-token and graduation-pool data sources. Mainnet and testnet share one schema and mapping source.

1. Copy this directory together with the repository's \`indexing/\` directory, preserving their relative
   paths.
2. Configure the Robinhood network aliases from \`networks.json\` in your Graph Node.
3. Run \`npm install && npm run codegen:mainnet && npm run build:mainnet\` (or the testnet variants).

The discovery events are the authoritative initial records. A dynamic template created while handling
an event may not replay earlier logs emitted by that new contract in the same transaction.
`;
}

function graphNetworkSlug(network) {
  return network.network.replace(/^robinhood-chain-/, "");
}

function graphManifest(network) {
  const fixed = network.sources.filter((source) => source.kind === "fixed");
  const dynamic = network.sources.filter((source) => source.kind === "dynamic");
  return `# Generated from the SDK public indexing boundary. Configure this network alias in Graph Node.
specVersion: 1.3.0
description: Launch On Block public integration events for ${network.network}
repository: https://github.com/ReptilianHQ/launch-on-block-sdk
schema:
  file: ./schema.graphql
dataSources:
${fixed.map((source) => graphSource(network, source)).join("\n")}templates:
${dynamic.map((source) => graphTemplate(network, source)).join("\n")}`;
}

function graphSource(network, source) {
  const contract = contractDefinition(source.contract);
  return `  - kind: ethereum/contract
    name: ${contract.name}
    network: ${network.network}
    source:
      address: '${source.address}'
      abi: ${contract.name}
      startBlock: ${source.startBlock}
${graphMappingBlock(contract)}`;
}

function graphTemplate(network, source) {
  const contract = contractDefinition(source.contract);
  return `  - kind: ethereum/contract
    name: ${contract.name}
    network: ${network.network}
    source:
      abi: ${contract.name}
${graphMappingBlock(contract)}`;
}

function graphMappingBlock(contract) {
  return `    mapping:
      kind: ethereum/events
      apiVersion: 0.0.9
      language: wasm/assemblyscript
      entities:
${contract.events.map((event) => `        - ${entityName(contract, event)}`).join("\n")}
      abis:
        - name: ${contract.name}
          file: ../../indexing/${contract.abiFile}
      eventHandlers:
${contract.events.map((event) => `        - event: ${graphEventSignature(contract, event)}\n          handler: handle${entityName(contract, event)}`).join("\n")}
      file: ./src/${contract.name}.ts
`;
}

function graphEventSignature(contract, event) {
  const abiEvent = contract.eventAbi.find((candidate) => candidate.name === event.name);
  if (!abiEvent) throw new Error(`missing ABI event ${contract.name}.${event.name}`);
  return `${event.name}(${abiEvent.inputs.map((input) => `${input.indexed ? "indexed " : ""}${input.type}`).join(",")})`;
}

function entitySchema(vendor) {
  return launchOnBlockEventCatalog.contracts.flatMap((contract) => contract.events.map((event) => {
    const directive = vendor === "graph" ? " @entity(immutable: true)" : "";
    const networkIdentity = vendor === "graph" ? "  network: String!" : "  chainId: BigInt!";
    return `type ${entityName(contract, event)}${directive} {
  id: ID!
${networkIdentity}
  emitter: ${vendor === "graph" ? "Bytes" : "String"}!
  blockNumber: BigInt!
  blockHash: ${vendor === "graph" ? "Bytes" : "String"}!
  blockTimestamp: BigInt!
  transactionHash: ${vendor === "graph" ? "Bytes" : "String"}!
  transactionIndex: BigInt!
  logIndex: BigInt!
${event.parameters.map((parameter) => `  ${parameter.name}: ${schemaType(parameter.type, vendor)}!`).join("\n")}
}`;
  })).join("\n\n");
}

function schemaType(abiType, vendor) {
  if (abiType.startsWith("uint") || abiType.startsWith("int")) return "BigInt";
  if (abiType === "bool") return "Boolean";
  if (abiType === "address" || abiType.startsWith("bytes")) return vendor === "graph" ? "Bytes" : "String";
  return "String";
}

function graphSchema() {
  return `# Generated decoded-event entities. Build domain read models from these immutable records.
${entitySchema("graph")}\n`;
}

function graphMapping(contract) {
  const generatedPath = contract.sourceKind === "dynamic"
    ? `../generated/templates/${contract.name}/${contract.name}`
    : `../generated/${contract.name}/${contract.name}`;
  const imports = [...new Set(contract.events.map((event) => event.name))].join(", ");
  const entities = contract.events.map((event) => entityName(contract, event)).join(", ");
  const templateImports = contract.name === "Launchpad"
    ? 'import { GraduationPool as GraduationPoolTemplate, LaunchToken as LaunchTokenTemplate } from "../generated/templates";\n'
    : "";
  const handlers = contract.events.map((event) => {
    const entity = entityName(contract, event);
    const discovery = event.name === "LaunchCreated"
      ? "\n  LaunchTokenTemplate.create(event.params.token);"
      : event.name === "Graduated"
        ? "\n  GraduationPoolTemplate.create(event.params.pool);"
        : "";
    return `export function handle${entity}(event: ${event.name}): void {
  const entity = new ${entity}(event.transaction.hash.concatI32(event.logIndex.toI32()));
  setMetadata(entity, event);
${event.parameters.map((parameter) => `  entity.${parameter.name} = event.params.${parameter.name};`).join("\n")}
  entity.save();${discovery}
}`;
  }).join("\n\n");
  return `// Generated runnable starter. Copy the example before adding domain-specific entities.
import { dataSource } from "@graphprotocol/graph-ts";
import { ${imports} } from "${generatedPath}";
${templateImports}import { ${entities} } from "../generated/schema";

${handlers.replaceAll("  setMetadata(entity, event);", `  entity.network = dataSource.network();\n  entity.emitter = event.address;\n  entity.blockNumber = event.block.number;\n  entity.blockHash = event.block.hash;\n  entity.blockTimestamp = event.block.timestamp;\n  entity.transactionHash = event.transaction.hash;\n  entity.transactionIndex = event.transaction.index;\n  entity.logIndex = event.logIndex;`)}
`;
}

function entityName(contract, event) {
  return `${contract.name}${event.name}Event`;
}

function contractDefinition(name) {
  const contract = launchOnBlockEventCatalog.contracts.find((candidate) => candidate.name === name);
  if (!contract) throw new Error(`unknown indexing contract ${name}`);
  return contract;
}

function indexingManifestSchema() {
  const address = { type: ["string", "null"], pattern: "^0x[0-9a-fA-F]{40}$" };
  const discovery = {
    type: ["object", "null"],
    required: ["contract", "event", "addressParameter"],
    properties: {
      contract: { const: "Launchpad" },
      event: { enum: ["LaunchCreated", "Graduated"] },
      addressParameter: { enum: ["token", "pool"] },
    },
    additionalProperties: false,
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://github.com/ReptilianHQ/launch-on-block-sdk/indexing/manifest.schema.json",
    title: "Launch On Block public indexing manifest",
    type: "object",
    required: ["$schema", "schemaVersion", "coverage", "abiRevision", "contracts", "networks"],
    properties: {
      $schema: { type: "string" },
      schemaVersion: { const: 1 },
      coverage: { const: "public_integration_events" },
      abiRevision: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
      contracts: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["name", "abiFile", "sourceKind", "discoveredBy", "events"],
          properties: {
            name: { enum: ["Launchpad", "Router", "FeeController", "LaunchToken", "GraduationPool"] },
            abiFile: { type: "string", pattern: "^abis/[A-Za-z]+\\.events\\.json$" },
            sourceKind: { enum: ["fixed", "dynamic"] },
            discoveredBy: discovery,
            events: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["name", "signature", "topic0", "description", "parameters"],
                properties: {
                  name: { type: "string", minLength: 1 },
                  signature: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]*\\(.*\\)$" },
                  topic0: { type: "string", pattern: "^0x[0-9a-f]{64}$" },
                  description: { type: "string", minLength: 1 },
                  parameters: {
                    type: "array",
                    items: {
                      type: "object",
                      required: ["name", "type", "indexed", "semantic"],
                      properties: {
                        name: { type: "string", minLength: 1 },
                        type: { type: "string", minLength: 1 },
                        indexed: { type: "boolean" },
                        semantic: { type: "string", minLength: 1 },
                      },
                      additionalProperties: false,
                    },
                  },
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
      networks: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["schemaVersion", "coverage", "caip2", "chainId", "network", "deploymentId", "releaseId", "abiRevision", "startBlock", "sources"],
          properties: {
            schemaVersion: { const: 1 },
            coverage: { const: "public_integration_events" },
            caip2: { type: "string", pattern: "^eip155:[1-9][0-9]*$" },
            chainId: { type: "integer", minimum: 1 },
            network: { type: "string", minLength: 1 },
            deploymentId: { type: "string", minLength: 1 },
            releaseId: { type: "string", minLength: 1 },
            abiRevision: { type: "string", pattern: "^sha256:[0-9a-f]{64}$" },
            startBlock: { type: "integer", minimum: 0 },
            sources: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["contract", "kind", "address", "startBlock", "discoveredBy"],
                properties: {
                  contract: { enum: ["Launchpad", "Router", "FeeController", "LaunchToken", "GraduationPool"] },
                  kind: { enum: ["fixed", "dynamic"] },
                  address,
                  startBlock: { type: ["integer", "null"], minimum: 0 },
                  discoveredBy: discovery,
                },
                additionalProperties: false,
              },
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };
}
