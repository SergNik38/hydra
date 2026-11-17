import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import type { DownloadVerifiedOptions } from "./download.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { redistManifest } from "./manifest.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  ensureRedistDownloaded,
  getRedistRoot,
  getRedistVersionDirectory,
} from "./redist.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { readWineRuntimeState } from "./state.ts";

const DOWNLOAD_HEADROOM = 1.25;

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hydra-redist-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const writeState = async (managedDirectory: string, redistVersion?: string) => {
  await fs.mkdir(managedDirectory, { recursive: true });
  await fs.writeFile(
    path.join(managedDirectory, "state.json"),
    JSON.stringify({
      version: "staging-11.18",
      binaryRelativePath: path.join("wine", "bin", "wine64"),
      installedAt: 1_700_000_000_000,
      dxvkVersion: "1.10.3-20230507-repack",
      ...(redistVersion ? { redistVersion } : {}),
    })
  );
};

const createDownloader = (
  calls: DownloadVerifiedOptions[] = []
): ((options: DownloadVerifiedOptions) => Promise<void>) => {
  return async (options) => {
    calls.push(options);
    await fs.mkdir(path.dirname(options.destination), { recursive: true });
    await fs.writeFile(
      options.destination,
      `fixture:${path.basename(options.destination)}`
    );
  };
};

describe("ensureRedistDownloaded", () => {
  it("downloads every pinned installer and records the version", async () => {
    await withTempDir(async (directory) => {
      const managedDirectory = path.join(directory, "managed");
      await writeState(managedDirectory);

      const calls: DownloadVerifiedOptions[] = [];
      const redistDirectory = await ensureRedistDownloaded({
        managedDirectory,
        download: createDownloader(calls),
      });

      assert.equal(
        redistDirectory,
        getRedistVersionDirectory(managedDirectory, redistManifest.version)
      );
      assert.deepEqual(
        calls.map((call) => call.url),
        redistManifest.installers.map((installer) => installer.url)
      );
      assert.deepEqual(
        calls.map((call) => call.maxBytes),
        redistManifest.installers.map((installer) =>
          Math.ceil(installer.sizeBytes * DOWNLOAD_HEADROOM)
        )
      );

      for (const installer of redistManifest.installers) {
        assert.equal(
          await fs.readFile(
            path.join(redistDirectory, installer.fileName),
            "utf8"
          ),
          `fixture:${installer.fileName}`
        );
        assert.equal(
          await fs.readFile(
            path.join(redistDirectory, `${installer.fileName}.ok`),
            "utf8"
          ),
          installer.sha256
        );
      }

      const state = readWineRuntimeState(managedDirectory);
      assert.equal(state?.version, "staging-11.18");
      assert.equal(state?.dxvkVersion, "1.10.3-20230507-repack");
      assert.equal(state?.redistVersion, redistManifest.version);
    });
  });

  it("does not download again when the pinned files are present", async () => {
    await withTempDir(async (directory) => {
      const managedDirectory = path.join(directory, "managed");
      await writeState(managedDirectory);

      const calls: DownloadVerifiedOptions[] = [];
      const download = createDownloader(calls);
      const first = await ensureRedistDownloaded({
        managedDirectory,
        download,
      });
      const second = await ensureRedistDownloaded({
        managedDirectory,
        download,
      });

      assert.equal(calls.length, redistManifest.installers.length);
      assert.equal(second, first);
    });
  });

  it("downloads only the installer whose marker is missing", async () => {
    await withTempDir(async (directory) => {
      const managedDirectory = path.join(directory, "managed");
      await writeState(managedDirectory);

      const calls: DownloadVerifiedOptions[] = [];
      const download = createDownloader(calls);
      const redistDirectory = await ensureRedistDownloaded({
        managedDirectory,
        download,
      });

      const lastInstaller = redistManifest.installers.at(-1);
      assert.ok(lastInstaller);
      await fs.rm(path.join(redistDirectory, `${lastInstaller.fileName}.ok`));

      await ensureRedistDownloaded({ managedDirectory, download });

      assert.equal(calls.length, redistManifest.installers.length + 1);
      assert.equal(calls.at(-1)?.url, lastInstaller.url);
    });
  });

  it("removes outdated redist version directories", async () => {
    await withTempDir(async (directory) => {
      const managedDirectory = path.join(directory, "managed");
      await writeState(managedDirectory, "old-version");
      await fs.mkdir(
        path.join(getRedistRoot(managedDirectory), "old-version"),
        {
          recursive: true,
        }
      );

      await ensureRedistDownloaded({
        managedDirectory,
        download: createDownloader(),
      });

      assert.deepEqual(await fs.readdir(getRedistRoot(managedDirectory)), [
        redistManifest.version,
      ]);
    });
  });
});
