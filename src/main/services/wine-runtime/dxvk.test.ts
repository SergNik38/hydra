import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import type { DxvkDownloader } from "./dxvk.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  ensureDxvkInstalled,
  getDxvkRoot,
  getDxvkVersionDirectory,
} from "./dxvk.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { dxvkManifest, wineRuntimeManifest } from "./manifest.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { readWineRuntimeState } from "./state.ts";

const DXVK_ROOT_NAME = "dxvk-macOS-async-v1.10.3-20230507-repack";
const ARCHITECTURES = ["x64", "x32"] as const;
const DLLS = ["d3d11.dll", "d3d10core.dll"] as const;

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hydra-dxvk-"));
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

const createDxvkDownloader = (
  archivePath: string,
  calls: { url: string; destination: string }[] = []
): DxvkDownloader => {
  return async (options) => {
    calls.push({ url: options.url, destination: options.destination });
    await fs.mkdir(path.dirname(options.destination), { recursive: true });
    await fs.copyFile(archivePath, options.destination);
  };
};

const writeState = async (managedDirectory: string, dxvkVersion?: string) => {
  await fs.mkdir(managedDirectory, { recursive: true });
  await fs.writeFile(
    path.join(managedDirectory, "state.json"),
    JSON.stringify({
      version: "staging-11.18",
      binaryRelativePath: path.join("wine", "bin", "wine64"),
      installedAt: 1_700_000_000_000,
      ...(dxvkVersion ? { dxvkVersion } : {}),
    })
  );
};

describe("ensureDxvkInstalled", () => {
  it("downloads only DXVK when the state lacks a dxvk version", async () => {
    await withTempDir(async (directory) => {
      const sourceDirectory = await createDxvkSource(directory);
      const archivePath = path.join(directory, "dxvk.tar.gz");
      createArchive(sourceDirectory, archivePath);

      const managedDirectory = path.join(directory, "managed");
      await writeState(managedDirectory);

      const calls: { url: string; destination: string }[] = [];
      const dxvkDirectory = await ensureDxvkInstalled({
        managedDirectory,
        download: createDxvkDownloader(archivePath, calls),
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, dxvkManifest.artifact.url);
      assert.equal(
        calls.some((call) => call.url === wineRuntimeManifest.artifact.url),
        false
      );

      const state = readWineRuntimeState(managedDirectory);
      assert.equal(state?.version, "staging-11.18");
      assert.equal(state?.dxvkVersion, dxvkManifest.version);
      assert.equal(
        dxvkDirectory,
        getDxvkVersionDirectory(managedDirectory, dxvkManifest.version)
      );
      assert.equal(
        (
          await fs.stat(path.join(dxvkDirectory, "x64", "d3d10core.dll"))
        ).isFile(),
        true
      );
      assert.deepEqual(await fs.readdir(getDxvkRoot(managedDirectory)), [
        dxvkManifest.version,
      ]);
    });
  });

  it("does not download again when the pinned DXVK version is installed", async () => {
    await withTempDir(async (directory) => {
      const sourceDirectory = await createDxvkSource(directory);
      const archivePath = path.join(directory, "dxvk.tar.gz");
      createArchive(sourceDirectory, archivePath);

      const managedDirectory = path.join(directory, "managed");
      await writeState(managedDirectory);

      const calls: { url: string; destination: string }[] = [];
      const download = createDxvkDownloader(archivePath, calls);
      const first = await ensureDxvkInstalled({ managedDirectory, download });
      const second = await ensureDxvkInstalled({ managedDirectory, download });

      assert.equal(calls.length, 1);
      assert.equal(second, first);
    });
  });

  it("removes outdated DXVK version directories", async () => {
    await withTempDir(async (directory) => {
      const sourceDirectory = await createDxvkSource(directory);
      const archivePath = path.join(directory, "dxvk.tar.gz");
      createArchive(sourceDirectory, archivePath);

      const managedDirectory = path.join(directory, "managed");
      await writeState(managedDirectory, "old-version");
      await fs.mkdir(path.join(getDxvkRoot(managedDirectory), "old-version"), {
        recursive: true,
      });

      await ensureDxvkInstalled({
        managedDirectory,
        download: createDxvkDownloader(archivePath),
      });

      assert.deepEqual(await fs.readdir(getDxvkRoot(managedDirectory)), [
        dxvkManifest.version,
      ]);
    });
  });
});
