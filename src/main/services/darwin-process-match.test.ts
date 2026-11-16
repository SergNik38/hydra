import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import {
  expandDarwinExecutablePath,
  hasDarwinProcessMatch,
} from "./darwin-process-match.ts";

const bundleDir = (bundlePath: string) =>
  path.join(bundlePath, "Contents", "MacOS");

describe("expandDarwinExecutablePath", () => {
  it("returns a plain binary path as is", async () => {
    const executablePath = "/Applications/Game/game-bin";
    const listDir = async () => {
      throw new Error("should not list a non-bundle path");
    };

    assert.deepEqual(
      await expandDarwinExecutablePath(executablePath, listDir),
      [executablePath]
    );
  });

  it("prefers the bundle-named binary and ignores helpers", async () => {
    const bundlePath = "/tmp/hydra-test-bundle-a/Game.app";
    const listDir = async (dir: string) => {
      assert.equal(dir, bundleDir(bundlePath));
      return ["helper", "Game"];
    };

    assert.deepEqual(await expandDarwinExecutablePath(bundlePath, listDir), [
      path.join(bundleDir(bundlePath), "Game"),
    ]);
  });

  it("returns the only binary when its name differs from the bundle", async () => {
    const bundlePath = "/tmp/hydra-test-bundle-b/Foo.app";
    const listDir = async () => ["foo-bin"];

    assert.deepEqual(await expandDarwinExecutablePath(bundlePath, listDir), [
      path.join(bundleDir(bundlePath), "foo-bin"),
    ]);
  });

  it("uses all binaries when none is named like the bundle", async () => {
    const bundlePath = "/tmp/hydra-test-bundle-c/Bar.app";
    const listDir = async () => ["bar-bin", "bar-helper"];

    assert.deepEqual(await expandDarwinExecutablePath(bundlePath, listDir), [
      path.join(bundleDir(bundlePath), "bar-bin"),
      path.join(bundleDir(bundlePath), "bar-helper"),
    ]);
  });

  it("skips hidden entries", async () => {
    const bundlePath = "/tmp/hydra-test-bundle-d/Hidden.app";

    assert.deepEqual(
      await expandDarwinExecutablePath(bundlePath, async () => [
        ".DS_Store",
        "hidden-bin",
      ]),
      [path.join(bundleDir(bundlePath), "hidden-bin")]
    );
  });

  it("handles a trailing slash and uppercase extension", async () => {
    const bundlePath = "/tmp/hydra-test-bundle-e/Caps.APP";
    const listDir = async (dir: string) => {
      assert.equal(dir, bundleDir(bundlePath));
      return ["caps"];
    };

    assert.deepEqual(
      await expandDarwinExecutablePath(`${bundlePath}/`, listDir),
      [path.join(bundleDir(bundlePath), "caps")]
    );
  });

  it("returns [] for an unreadable bundle and retries later", async () => {
    const bundlePath = "/tmp/hydra-test-bundle-f/Unreadable.app";
    let readable = false;
    const listDir = async () => {
      if (!readable) throw new Error("ENOENT");
      return ["Unreadable"];
    };

    assert.deepEqual(await expandDarwinExecutablePath(bundlePath, listDir), []);

    readable = true;

    assert.deepEqual(await expandDarwinExecutablePath(bundlePath, listDir), [
      path.join(bundleDir(bundlePath), "Unreadable"),
    ]);
  });

  it("reads a real bundle from disk by default", async () => {
    const bundlePath = await fs.mkdtemp(
      path.join(os.tmpdir(), "hydra-mac-bundle-")
    );

    try {
      const appPath = path.join(bundlePath, "Real.app");
      await fs.mkdir(bundleDir(appPath), { recursive: true });
      await fs.writeFile(path.join(bundleDir(appPath), "Real"), "");
      await fs.writeFile(path.join(bundleDir(appPath), "helper"), "");

      assert.deepEqual(await expandDarwinExecutablePath(appPath), [
        path.join(bundleDir(appPath), "Real"),
      ]);

      const unreadableAppPath = path.join(bundlePath, "Missing.app");
      assert.deepEqual(await expandDarwinExecutablePath(unreadableAppPath), []);
    } finally {
      await fs.rm(bundlePath, { recursive: true, force: true });
    }
  });
});

describe("hasDarwinProcessMatch", () => {
  const binaryPath = "/Applications/Game.app/Contents/MacOS/Game";

  const processMapWith = (paths: string[]) =>
    new Map([["game", new Set(paths)]]);

  it("matches an exact process path", () => {
    assert.equal(
      hasDarwinProcessMatch([binaryPath], processMapWith([binaryPath])),
      true
    );
  });

  it("matches case-insensitively", () => {
    assert.equal(
      hasDarwinProcessMatch(
        [binaryPath],
        processMapWith([binaryPath.toLowerCase()])
      ),
      true
    );
  });

  it("does not match the same basename in a different directory", () => {
    assert.equal(
      hasDarwinProcessMatch(
        [binaryPath],
        processMapWith(["/Users/me/Games/Game.app/Contents/MacOS/Game"])
      ),
      false
    );
  });

  it("returns false for empty candidates", () => {
    assert.equal(
      hasDarwinProcessMatch([], processMapWith([binaryPath])),
      false
    );
  });
});
