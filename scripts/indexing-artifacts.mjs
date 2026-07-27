import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { launchOnBlockEventCatalog, listIndexingManifests } from "../dist/indexing.js";
import { validateExamplePackageFiles } from "./example-lockfiles.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];
const preservedPaths = [
  "examples/envio/README.md",
  "examples/envio/package.json",
  "examples/envio/package-lock.json",
  "examples/graph/README.md",
  "examples/graph/package.json",
  "examples/graph/package-lock.json",
];
const examplePackagePairs = [
  ["examples/envio/package.json", "examples/envio/package-lock.json"],
  ["examples/graph/package.json", "examples/graph/package-lock.json"],
];
const ignoredGeneratedEntries = new Set(["node_modules", ".envio", "build", "generated", "envio-env.d.ts"]);

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
  ["examples/envio/schema.graphql", envioSchema()],
  ["examples/envio/tsconfig.json", json(envioTsconfig())],
  ["examples/envio/src/EventHandlers.ts", envioHandlers()],
  ["examples/graph/networks.json", json(graphNetworks(manifests))],
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
  const preserved = new Map(preservedPaths.map((relativePath) => {
    const path = resolve(root, relativePath);
    if (!existsSync(path)) throw new Error(`required maintained example file is missing: ${relativePath}`);
    return [relativePath, readFileSync(path, "utf8")];
  }));
  validateExamplePackages();
  rmSync(resolve(root, "indexing"), { recursive: true, force: true });
  rmSync(resolve(root, "examples", "envio"), { recursive: true, force: true });
  rmSync(resolve(root, "examples", "graph"), { recursive: true, force: true });
  for (const [relativePath, content] of [...artifacts, ...preserved]) {
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
  const expectedPaths = new Set([...artifacts.keys(), ...preservedPaths]);
  for (const generatedRoot of generatedRoots) {
    for (const path of listFiles(generatedRoot)) {
      const relativePath = path.slice(root.length + 1);
      if (!expectedPaths.has(relativePath)) drift.push(relativePath);
    }
  }
  try {
    validateExamplePackages();
  } catch (error) {
    drift.push(error instanceof Error ? error.message : String(error));
  }
  if (drift.length > 0) throw new Error(`indexing artifacts are stale, missing, or unexpected: ${drift.join(", ")}`);
  console.log(`verified ${artifacts.size} indexing artifacts`);
}

function validateExamplePackages() {
  for (const [packagePath, lockPath] of examplePackagePairs) {
    validateExamplePackageFiles(root, packagePath, lockPath);
  }
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignoredGeneratedEntries.has(entry.name)) return [];
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
generated, lockfile-pinned, and drift-checked, but intentionally are not part of the npm package API.
Their separate CLI dependency graphs are monitored by Dependabot.
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
    const rpcEnvironment = network.chainId === 4663
      ? "ENVIO_ROBINHOOD_MAINNET_RPC_URL"
      : "ENVIO_ROBINHOOD_TESTNET_RPC_URL";
    return [
      `  - id: ${network.chainId}`,
      `    start_block: ${network.startBlock}`,
      "    rpc:",
      `      - url: \${${rpcEnvironment}}`,
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

function envioTsconfig() {
  return {
    compilerOptions: {
      lib: ["es2022"],
      module: "ESNext",
      moduleResolution: "bundler",
      noEmit: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: true,
      strict: true,
      target: "es2022",
      verbatimModuleSyntax: true,
    },
    include: ["envio-env.d.ts", "src/**/*.ts"],
  };
}

function envioHandlers() {
  const handlers = launchOnBlockEventCatalog.contracts.flatMap((contract) => contract.events.map((event) => {
    const entity = entityName(contract, event);
    return `indexer.onEvent({ contract: "${contract.name}", event: "${event.name}" }, async ({ event, context }) => {
  context.${entity}.set({
    ...metadata(event),
${event.parameters.map((parameter) => `    ${parameter.name}: ${envioValue(parameter)},`).join("\n")}
  });
});`;
  })).join("\n\n");
  const registrations = `indexer.contractRegister(
  { contract: "Launchpad", event: "LaunchCreated" },
  async ({ event, context }) => {
    context.chain.LaunchToken.add(event.params.token);
  },
);

indexer.contractRegister(
  { contract: "Launchpad", event: "Graduated" },
  async ({ event, context }) => {
    context.chain.GraduationPool.add(event.params.pool);
  },
);`;
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
    transactionHash: required(event.transaction.hash, "transaction.hash"),
    transactionIndex: BigInt(required(event.transaction.transactionIndex, "transaction.transactionIndex")),
    logIndex: BigInt(event.logIndex),
  };
}

function required<T>(value: T | undefined, field: string): T {
  if (value === undefined) throw new Error(\`Envio did not provide required provenance field ${"${field}"}\`);
  return value;
}

${handlers}

${registrations}
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
  id: ${vendor === "graph" ? "Bytes" : "ID"}!
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
${event.parameters.map((parameter) => `  entity.${parameter.name} = ${graphValue(parameter)};`).join("\n")}
  entity.save();${discovery}
}`;
  }).join("\n\n");
  return `// Generated runnable starter. Copy the example before adding domain-specific entities.
import { BigInt, dataSource } from "@graphprotocol/graph-ts";
import { ${imports} } from "${generatedPath}";
${templateImports}import { ${entities} } from "../generated/schema";

${handlers.replaceAll("  setMetadata(entity, event);", `  entity.network = dataSource.network();\n  entity.emitter = event.address;\n  entity.blockNumber = event.block.number;\n  entity.blockHash = event.block.hash;\n  entity.blockTimestamp = event.block.timestamp;\n  entity.transactionHash = event.transaction.hash;\n  entity.transactionIndex = event.transaction.index;\n  entity.logIndex = event.logIndex;`)}
`;
}

function graphValue(parameter) {
  const integer = /^(u?int)([0-9]+)$/.exec(parameter.type);
  if (integer && Number(integer[2]) <= 24) return `BigInt.fromI32(event.params.${parameter.name})`;
  return `event.params.${parameter.name}`;
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
  const exactDiscovery = (event, addressParameter) => ({
    type: "object",
    required: ["contract", "event", "addressParameter"],
    properties: {
      contract: { const: "Launchpad" },
      event: { const: event },
      addressParameter: { const: addressParameter },
    },
    additionalProperties: false,
  });
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
          oneOf: [
            {
              properties: {
                name: { enum: ["Launchpad", "Router", "FeeController"] },
                sourceKind: { const: "fixed" },
                discoveredBy: { type: "null" },
              },
            },
            {
              properties: {
                name: { const: "LaunchToken" },
                sourceKind: { const: "dynamic" },
                discoveredBy: exactDiscovery("LaunchCreated", "token"),
              },
            },
            {
              properties: {
                name: { const: "GraduationPool" },
                sourceKind: { const: "dynamic" },
                discoveredBy: exactDiscovery("Graduated", "pool"),
              },
            },
          ],
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
                oneOf: [
                  {
                    properties: {
                      contract: { enum: ["Launchpad", "Router", "FeeController"] },
                      kind: { const: "fixed" },
                      address: { type: "string", pattern: "^0x[0-9a-fA-F]{40}$" },
                      startBlock: { type: "integer", minimum: 0 },
                      discoveredBy: { type: "null" },
                    },
                  },
                  {
                    properties: {
                      contract: { const: "LaunchToken" },
                      kind: { const: "dynamic" },
                      address: { type: "null" },
                      startBlock: { type: "null" },
                      discoveredBy: exactDiscovery("LaunchCreated", "token"),
                    },
                  },
                  {
                    properties: {
                      contract: { const: "GraduationPool" },
                      kind: { const: "dynamic" },
                      address: { type: "null" },
                      startBlock: { type: "null" },
                      discoveredBy: exactDiscovery("Graduated", "pool"),
                    },
                  },
                ],
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
