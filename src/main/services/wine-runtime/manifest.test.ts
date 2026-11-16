import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { parseWineRuntimeManifest, wineRuntimeManifest } from "./manifest.ts";

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
