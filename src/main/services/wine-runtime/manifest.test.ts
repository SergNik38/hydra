import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import {
  dxvkManifest,
  parseDxvkManifest,
  parseRedistManifest,
  parseWineRuntimeManifest,
  redistManifest,
  wineRuntimeManifest,
} from "./manifest.ts";

describe("wine runtime manifest", () => {
  it("validates the pinned manifest", () => {
    assert.equal(wineRuntimeManifest.version, "staging-11.18");
    assert.equal(
      wineRuntimeManifest.artifact.fileName,
      "wine-staging-11.18-osx64.tar.xz"
    );
    assert.match(wineRuntimeManifest.artifact.sha256, /^[a-f0-9]{64}$/);
    assert.equal(wineRuntimeManifest.artifact.url.startsWith("https://"), true);
    assert.deepEqual(parseWineRuntimeManifest(wineRuntimeManifest), {
      ...wineRuntimeManifest,
    });
  });

  it("rejects a bad sha256", () => {
    const manifest = structuredClone(wineRuntimeManifest);
    manifest.artifact.sha256 = "abc";

    assert.throws(
      () => parseWineRuntimeManifest(manifest),
      /sha256 is invalid/
    );
  });

  it("rejects an http artifact url", () => {
    const manifest = structuredClone(wineRuntimeManifest);
    manifest.artifact.url = manifest.artifact.url.replace("https:", "http:");

    assert.throws(
      () => parseWineRuntimeManifest(manifest),
      /url must be https/
    );
  });

  it("rejects a manifest with missing fields", () => {
    assert.throws(() => parseWineRuntimeManifest(null), /manifest is invalid/);
    assert.throws(() => parseWineRuntimeManifest({}), /has no version/);
  });
});

describe("dxvk runtime manifest", () => {
  it("validates the pinned manifest", () => {
    assert.equal(dxvkManifest.version, "1.10.3-20230507-repack");
    assert.equal(dxvkManifest.license, "Zlib");
    assert.equal(
      dxvkManifest.artifact.fileName,
      "dxvk-macOS-async-v1.10.3-20230507-repack.tar.gz"
    );
    assert.equal(
      dxvkManifest.artifact.sha256,
      "acd1520ad105d8ef124a09c8e11a259a5dc8bdc565ad18e0e52693f9807b2477"
    );
    assert.equal(dxvkManifest.artifact.sizeBytes, 2793443);
    assert.match(dxvkManifest.artifact.sha256, /^[a-f0-9]{64}$/);
    assert.equal(dxvkManifest.artifact.url.startsWith("https://"), true);
    assert.deepEqual(parseDxvkManifest(dxvkManifest), {
      ...dxvkManifest,
    });
  });

  it("rejects a bad sha256", () => {
    const manifest = structuredClone(dxvkManifest);
    manifest.artifact.sha256 = "abc";

    assert.throws(() => parseDxvkManifest(manifest), /sha256 is invalid/);
  });

  it("rejects an http artifact url", () => {
    const manifest = structuredClone(dxvkManifest);
    manifest.artifact.url = manifest.artifact.url.replace("https:", "http:");

    assert.throws(() => parseDxvkManifest(manifest), /url must be https/);
  });

  it("rejects a missing dxvk block", () => {
    assert.throws(() => parseDxvkManifest(undefined), /manifest is invalid/);
    assert.throws(() => parseDxvkManifest({}), /has no version/);
  });
});

describe("redist manifest", () => {
  it("validates the pinned manifest", () => {
    assert.equal(redistManifest.version, "vcaio-openal-1");
    assert.deepEqual(
      redistManifest.installers.map((installer) => installer.fileName),
      ["VisualCppRedist_AIO_x86_x64.exe", "oalinst.exe"]
    );
    assert.deepEqual(
      redistManifest.installers.map((installer) => installer.args),
      [["/ai", "/gm2"], ["/silent"]]
    );
    assert.deepEqual(
      redistManifest.installers.map((installer) => installer.sha256),
      [
        "341513a8c49e3780bc01acde9c893e8176072412f042e83f2a9f296e6328eba4",
        "b8f39714d41e009f75efb183c37100f2cbabb71784bbd243be881ac5b42d86fd",
      ]
    );
    assert.deepEqual(
      redistManifest.installers.map((installer) => installer.sizeBytes),
      [29037257, 809496]
    );

    for (const installer of redistManifest.installers) {
      assert.match(installer.sha256, /^[a-f0-9]{64}$/);
      assert.equal(installer.url.startsWith("https://"), true);
    }
    assert.deepEqual(parseRedistManifest(redistManifest), {
      ...redistManifest,
    });
  });

  it("rejects a bad sha256", () => {
    const manifest = structuredClone(redistManifest);
    manifest.installers[0].sha256 = "abc";

    assert.throws(() => parseRedistManifest(manifest), /sha256 is invalid/);
  });

  it("rejects an http artifact url", () => {
    const manifest = structuredClone(redistManifest);
    manifest.installers[0].url = manifest.installers[0].url.replace(
      "https:",
      "http:"
    );

    assert.throws(() => parseRedistManifest(manifest), /url must be https/);
  });

  it("rejects invalid installer args", () => {
    const missingArgs = structuredClone(redistManifest) as unknown as {
      installers: Record<string, unknown>[];
    };
    delete missingArgs.installers[0].args;

    assert.throws(() => parseRedistManifest(missingArgs), /args are invalid/);

    const nonStringArgs = structuredClone(redistManifest) as unknown as {
      installers: { args: unknown[] }[];
    };
    nonStringArgs.installers[1].args = ["/silent", 1];

    assert.throws(() => parseRedistManifest(nonStringArgs), /args are invalid/);
  });

  it("rejects a manifest without installers", () => {
    assert.throws(() => parseRedistManifest(undefined), /manifest is invalid/);
    assert.throws(() => parseRedistManifest({}), /has no version/);
    assert.throws(
      () => parseRedistManifest({ version: "v1", installers: [] }),
      /has no installers/
    );
  });
});
