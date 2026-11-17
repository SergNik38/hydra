import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import {
  dxvkManifest,
  parseDxvkManifest,
  parseWineRuntimeManifest,
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
