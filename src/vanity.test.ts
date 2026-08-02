import { describe, expect, it } from "vitest";
import { getAddress } from "viem";
import {
  LAUNCH_TOKEN_TOTAL_SUPPLY,
  mineLaunchTokenVanitySalt,
  predictLaunchTokenAddress,
} from "./index.js";

const launchpad = getAddress("0x135492b3ccb2cb64749f91332f929f49a1deed3f");
const creator = getAddress("0x540BC98C9fa151830C9Cb81e80E3576d8Bc580Fa");
const salt = "0x0000000000000000000000000000000000000000000000000000000000000001";

describe("LaunchToken vanity CREATE2 helpers", () => {
  it("matches a createLaunchVanity mainnet eth_call oracle", () => {
    expect(predictLaunchTokenAddress({
      launchpad,
      creator,
      name: "Gecko",
      symbol: "GECKO",
      metadataUri: "",
      salt,
    })).toBe("0xA61dEb9B0B90d7527F4D8cDEF42a718282E39204");
    expect(LAUNCH_TOKEN_TOTAL_SUPPLY).toBe(10n ** 27n);
  });

  it("matches the gen-12 testnet Launchpad eth_call oracle", () => {
    expect(predictLaunchTokenAddress({
      launchpad: getAddress("0x9fe4f17b53a520c4c8672c945285574a7396340f"),
      creator: getAddress("0x0000000000000000000000000000000000000001"),
      name: "Gecko",
      symbol: "GECKO",
      metadataUri: "",
      salt,
    })).toBe("0xa631B5af39a82437029A5a3D3710dc4ccaF8412e");
  });

  it("finds a suffix in a bounded deterministic range", () => {
    expect(mineLaunchTokenVanitySalt({
      launchpad,
      creator,
      name: "Gecko",
      symbol: "GECKO",
      metadataUri: "",
      suffix: "140",
      maxAttempts: 5,
    })).toEqual({
      address: "0xA6396f945401B904EE5ad98Cd2d0CE018F886140",
      salt: "0x0000000000000000000000000000000000000000000000000000000000000005",
      attempts: 5,
    });
  });

  it("returns null for an exhausted range and rejects unsafe inputs", () => {
    expect(mineLaunchTokenVanitySalt({
      launchpad,
      creator,
      name: "Gecko",
      symbol: "GECKO",
      metadataUri: "",
      suffix: "ffff",
      maxAttempts: 2,
    })).toBeNull();
    expect(() => predictLaunchTokenAddress({
      launchpad,
      creator,
      name: "Gecko",
      symbol: "GECKO",
      metadataUri: "",
      salt: "0x00",
    })).toThrow(/32-byte/);
    expect(() => mineLaunchTokenVanitySalt({
      launchpad,
      creator,
      name: "Gecko",
      symbol: "GECKO",
      metadataUri: "",
      suffix: "blk",
    })).toThrow(/hexadecimal/);
  });
});
