import { describe, expect, it } from "vitest";
import { getIndexingManifest, launchOnBlockEventCatalog, listIndexingManifests } from "./indexing.js";

describe("public indexing catalog", () => {
  it("publishes deterministic signatures, topics, semantics, and dynamic discovery", () => {
    const launchpad = launchOnBlockEventCatalog.contracts.find((contract) => contract.name === "Launchpad");
    expect(launchpad?.events.find((event) => event.name === "LaunchCreated")).toMatchObject({
      signature: "LaunchCreated(address,address,uint16,uint16,address,string)",
      topic0: "0xae76055728f8aa67cf9f5fb3080ad262991120b513b585fe5b4f1b211ea84321",
    });
    expect(launchpad?.events.find((event) => event.name === "Buy")?.parameters).toContainEqual({
      name: "amountIn",
      type: "uint256",
      indexed: false,
      semantic: "raw_native_quote_amount",
    });
    expect(launchOnBlockEventCatalog.contracts.find((contract) => contract.name === "LaunchToken")?.discoveredBy)
      .toEqual({ contract: "Launchpad", event: "LaunchCreated", addressParameter: "token" });
  });

  it("binds fixed and dynamic sources to the exact release boundary", () => {
    const manifest = getIndexingManifest(4663);
    expect(manifest).toMatchObject({
      coverage: "public_integration_events",
      caip2: "eip155:4663",
      deploymentId: "4663:launchpad:0x135492b3ccb2cb64749f91332f929f49a1deed3f:17957183",
      releaseId: "gen-12",
      startBlock: 17_957_183,
    });
    expect(manifest.sources.find((source) => source.contract === "Launchpad")).toMatchObject({
      kind: "fixed",
      address: "0x135492B3cCb2cb64749F91332F929F49a1DeeD3F",
      startBlock: 17_957_183,
    });
    expect(manifest.sources.find((source) => source.contract === "GraduationPool")).toMatchObject({
      kind: "dynamic",
      address: null,
      startBlock: null,
    });
    const all = listIndexingManifests();
    expect(all.map((item) => item.chainId)).toEqual([4663, 46630]);
    for (const item of all) {
      const launchpad = item.sources.find((source) => source.contract === "Launchpad");
      expect(item.deploymentId).toBe(
        `${item.chainId}:launchpad:${launchpad?.address?.toLowerCase()}:${item.startBlock}`,
      );
    }
  });
});
