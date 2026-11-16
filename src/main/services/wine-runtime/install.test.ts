import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { findWineBinary, installArchive } from "./install.ts";

const WINE_BIN = path.join(
  "Wine Staging.app",
  "Contents",
  "Resources",
  "wine",
  "bin"
);

const writeFixture = async (
  root: string,
  relativePath: string,
  mode = 0o644
) => {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "fixture");
  await fs.chmod(filePath, mode);
};

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hydra-wine-install-")
  );
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

describe("findWineBinary", () => {
  it("prefers wine64 over wine in the same bin directory", async () => {
    await withTempDir(async (directory) => {
      await writeFixture(directory, path.join(WINE_BIN, "wine"), 0o755);
      await writeFixture(directory, path.join(WINE_BIN, "wine64"), 0o755);

      assert.equal(
        await findWineBinary(directory),
        path.join(WINE_BIN, "wine64")
      );
    });
  });

  it("finds wine when wine64 is absent", async () => {
    await withTempDir(async (directory) => {
      await writeFixture(directory, path.join(WINE_BIN, "wine"), 0o755);

      assert.equal(
        await findWineBinary(directory),
        path.join(WINE_BIN, "wine")
      );
    });
  });

  it("ignores non-executable binaries", async () => {
    await withTempDir(async (directory) => {
      await writeFixture(directory, path.join(WINE_BIN, "wine64"), 0o644);

      assert.equal(await findWineBinary(directory), null);
    });
  });

  it("returns null for a tree without a Wine binary", async () => {
    await withTempDir(async (directory) => {
      await writeFixture(directory, "Some.app/Contents/Info.plist");

      assert.equal(await findWineBinary(directory), null);
    });
  });
});

describe("installArchive", () => {
  it("extracts the archive and reports the relative binary path", async () => {
    await withTempDir(async (directory) => {
      const sourceDirectory = path.join(directory, "source");
      await writeFixture(sourceDirectory, path.join(WINE_BIN, "wine"), 0o755);
      await writeFixture(sourceDirectory, path.join(WINE_BIN, "wine64"), 0o755);

      const archivePath = path.join(directory, "wine.tar.xz");
      execFileSync("/usr/bin/tar", [
        "-cJf",
        archivePath,
        "-C",
        sourceDirectory,
        ".",
      ]);

      const versionDir = path.join(directory, "managed", "staging-11.18");
      const result = await installArchive({ archivePath, versionDir });

      assert.equal(result.binaryRelativePath, path.join(WINE_BIN, "wine64"));
      assert.equal(
        (
          await fs.stat(path.join(versionDir, result.binaryRelativePath))
        ).isFile(),
        true
      );
      assert.equal(await findWineBinary(versionDir), result.binaryRelativePath);
      assert.deepEqual(await fs.readdir(path.dirname(versionDir)), [
        "staging-11.18",
      ]);
    });
  });
});
