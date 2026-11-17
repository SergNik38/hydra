import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { installDxvkArchive } from "./dxvk-archive.ts";

const DXVK_ROOT_NAME = "dxvk-macOS-async-v1.10.3-20230507-repack";
const ARCHITECTURES = ["x64", "x32"] as const;
const DLLS = ["d3d11.dll", "d3d10core.dll"] as const;

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hydra-dxvk-archive-")
  );
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const writeFixture = async (root: string, relativePath: string) => {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "fixture");
};

const createDxvkSource = async (directory: string) => {
  const root = path.join(directory, "source", DXVK_ROOT_NAME);
  for (const architecture of ARCHITECTURES) {
    for (const dll of DLLS) {
      await writeFixture(root, path.join(architecture, dll));
    }
  }
  await writeFixture(root, "dxvk.conf");
  return path.join(directory, "source");
};

const createArchive = (sourceDirectory: string, archivePath: string) => {
  execFileSync("/usr/bin/tar", [
    "-czf",
    archivePath,
    "-C",
    sourceDirectory,
    ".",
  ]);
};

describe("installDxvkArchive", () => {
  it("extracts the archive and strips the top-level directory", async () => {
    await withTempDir(async (directory) => {
      const sourceDirectory = await createDxvkSource(directory);
      const archivePath = path.join(directory, "dxvk.tar.gz");
      createArchive(sourceDirectory, archivePath);

      const versionDir = path.join(directory, "managed", "dxvk", "version");
      await installDxvkArchive({ archivePath, versionDir });

      assert.deepEqual((await fs.readdir(versionDir)).sort(), [
        "dxvk.conf",
        "x32",
        "x64",
      ]);
      assert.equal(
        (await fs.stat(path.join(versionDir, "x64", "d3d11.dll"))).isFile(),
        true
      );
      assert.deepEqual(await fs.readdir(path.dirname(versionDir)), ["version"]);
    });
  });

  it("rejects an archive without the DXVK DLL layout", async () => {
    await withTempDir(async (directory) => {
      const sourceDirectory = path.join(directory, "source");
      await writeFixture(sourceDirectory, "readme.txt");
      const archivePath = path.join(directory, "dxvk.tar.gz");
      createArchive(sourceDirectory, archivePath);

      await assert.rejects(
        installDxvkArchive({
          archivePath,
          versionDir: path.join(directory, "managed", "dxvk", "version"),
        }),
        /expected DLL layout/
      );
    });
  });
});
