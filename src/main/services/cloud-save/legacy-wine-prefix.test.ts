import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { legacyCloudSyncPrefixPath } from "./legacy-wine-prefix.ts";

describe("legacy cloud sync prefix path", () => {
  it("keeps the prefix for Windows games on macOS", () => {
    assert.equal(
      legacyCloudSyncPrefixPath("darwin", "/Games/Game/Game.exe", "/prefix"),
      "/prefix"
    );
  });

  it("drops the default prefix for native macOS games", () => {
    assert.equal(
      legacyCloudSyncPrefixPath(
        "darwin",
        "/Applications/Game.app/Contents/MacOS/Game",
        "/prefix"
      ),
      null
    );
  });

  it("drops the default prefix without an executable", () => {
    assert.equal(
      legacyCloudSyncPrefixPath("darwin", undefined, "/prefix"),
      null
    );
    assert.equal(legacyCloudSyncPrefixPath("darwin", null, "/prefix"), null);
  });

  it("keeps the existing behavior on other platforms", () => {
    assert.equal(
      legacyCloudSyncPrefixPath("linux", "/home/game/game.exe", "/prefix"),
      "/prefix"
    );
    assert.equal(legacyCloudSyncPrefixPath("linux", null, null), null);
    assert.equal(
      legacyCloudSyncPrefixPath("win32", "C:/Games/Game/Game.exe", null),
      null
    );
  });
});
