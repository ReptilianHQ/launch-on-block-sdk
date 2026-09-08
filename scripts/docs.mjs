import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const write = process.argv[2] === "--write";
if (!write && process.argv[2] !== "--check") throw new Error("Use --write or --check after building");
const fence = (text) => `\`\`\`ts\n${text.trim()}\n\`\`\``;
function update(path, generated) {
  const file = resolve(root, path);
  const source = readFileSync(file, "utf8");
  const start = "<!-- BEGIN GENERATED -->";
  const end = "<!-- END GENERATED -->";
  if (source.split(start).length !== 2 || source.split(end).length !== 2
    || source.indexOf(start) > source.indexOf(end)) throw new Error(`${path}: expected one generated region`);
  const expected = source.slice(0, source.indexOf(start) + start.length)
    + `\n\n${generated.trim()}\n\n` + source.slice(source.indexOf(end));
  if (write) writeFileSync(file, expected);
  else if (source !== expected) throw new Error(`${path} is stale; run npm run generate:docs`);
}

const api = [
  "## Package exports",
  `Generated from package version ${manifest.version}; requires Node ${manifest.engines.node} and viem ${manifest.peerDependencies.viem}.`,
  "Import the package root for all named exports, or a narrow module below. JSON entries are data assets, not functions.",
  ["| Subpath | Target(s) |", "| --- | --- |",
    ...Object.entries(manifest.exports).map(([key, value]) =>
      `| \`${key}\` | ${Object.values(typeof value === "string" ? { data: value } : value).map((target) => `\`${target}\``).join(", ")} |`),
  ].join("\n"),
];
const rootModule = await import(pathToFileURL(resolve(root, manifest.exports["."].import)).href);
const documented = new Set();
for (const [subpath, targets] of Object.entries(manifest.exports)) {
  if (subpath === "." || typeof targets === "string") continue;
  const module = await import(pathToFileURL(resolve(root, targets.import)).href);
  const names = Object.keys(module).sort();
  names.forEach((name) => documented.add(name));
  const declarations = readFileSync(resolve(root, targets.types), "utf8").replace(/^\/\/# sourceMappingURL=.*$/gm, "").trim();
  api.push(`## ${subpath}`, `Runtime exports: ${names.map((name) => `\`${name}\``).join(", ")}.`,
    "Exact public declaration surface (including parameter, result, and option types):", fence(declarations));
}
const missing = Object.keys(rootModule).filter((name) => !documented.has(name));
if (missing.length) throw new Error(`Root exports missing from reference: ${missing.join(", ")}`);
update("docs/API_REFERENCE.md", api.join("\n\n"));
update("docs/QUICKSTART.md", [
  "## Read-only quickstart", "Source: [`examples/consumer/quickstart.ts`](../examples/consumer/quickstart.ts).",
  fence(readFileSync(resolve(root, "examples/consumer/quickstart.ts"), "utf8")),
  "## Wallet integration", "Source: [`examples/consumer/buy.ts`](../examples/consumer/buy.ts). Import this function into your application; importing it does not submit a transaction.",
  fence(readFileSync(resolve(root, "examples/consumer/buy.ts"), "utf8")),
  "## Offline examples", "Source: [`examples/consumer/offline.ts`](../examples/consumer/offline.ts). This file makes no RPC calls and is executed by the package check.",
  fence(readFileSync(resolve(root, "examples/consumer/offline.ts"), "utf8")),
].join("\n\n"));
const reference = readFileSync(resolve(root, "docs/API_REFERENCE.md"), "utf8");
const errorDeclaration = readFileSync(resolve(root, "dist/errors.d.ts"), "utf8").match(/export type SdkErrorCode = ([^;]+);/)[1];
const codes = [...errorDeclaration.matchAll(/"([A-Z_]+)"/g)].map((match) => match[1]).sort();
const documentedCodes = [...reference.split("<!-- BEGIN GENERATED -->")[0].matchAll(/^\| `([A-Z_]+)` \|/gm)]
  .map((match) => match[1]).sort();
if (JSON.stringify(codes) !== JSON.stringify(documentedCodes)) throw new Error("API error explanations must cover each current code exactly once");
for (const path of ["README.md", "docs/API_REFERENCE.md", "docs/QUICKSTART.md", "docs/RELEASING.md", "docs/DEPLOYMENT_METADATA.md"]) {
  const source = readFileSync(resolve(root, path), "utf8");
  for (const [, href] of source.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const publicPrefix = "https://github.com/ReptilianHQ/launch-on-block-sdk/blob/main/";
    const local = href.startsWith(publicPrefix) ? resolve(root, href.slice(publicPrefix.length).split("#")[0])
      : !/^(?:https?:|#)/.test(href) ? resolve(root, dirname(path), href.split("#")[0]) : null;
    if (local && !existsSync(local)) throw new Error(`${path}: broken repository link ${href}`);
    if (href.includes("github.com/ReptilianHQ/reptilian/")) throw new Error(`${path}: consumer docs must not require private standards links`);
  }
}
console.log(`${write ? "generated" : "verified"} API reference for ${Object.keys(rootModule).length} runtime exports and three consumer examples`);
