import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  downloadVerified,
  type DownloadProgressCallback,
  type DownloadVerifiedOptions,
} from "./download.js";
import { hasDxvkLayout, installDxvkArchive } from "./dxvk-archive.js";
import { dxvkManifest } from "./manifest.js";
import { readWineRuntimeState, writeWineRuntimeState } from "./state.js";

export const DXVK_DIRECTORY_NAME = "dxvk";
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const DOWNLOAD_SIZE_HEADROOM = 1.25;

export type DxvkDownloader = (
  options: DownloadVerifiedOptions
) => Promise<void>;

export interface EnsureDxvkInstalledOptions {
  managedDirectory: string;
  onProgress?: DownloadProgressCallback;
  download?: DxvkDownloader;
}

export const getDxvkRoot = (managedDirectory: string) =>
  path.join(managedDirectory, DXVK_DIRECTORY_NAME);

export const getDxvkVersionDirectory = (
  managedDirectory: string,
  version: string
) => path.join(getDxvkRoot(managedDirectory), version);

export const findInstalledDxvkDirectory = (
  managedDirectory: string,
  dxvkVersion: string | undefined
): string | null => {
  if (dxvkVersion !== dxvkManifest.version) return null;
  const directory = getDxvkVersionDirectory(managedDirectory, dxvkVersion);
  return hasDxvkLayout(directory) ? directory : null;
};

export const removeOtherDxvkVersions = async (
  managedDirectory: string,
  keptVersion: string
) => {
  const dxvkRoot = getDxvkRoot(managedDirectory);
  const entries = await fs.promises
    .readdir(dxvkRoot, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== keptVersion)
      .map((entry) =>
        fs.promises
          .rm(path.join(dxvkRoot, entry.name), {
            recursive: true,
            force: true,
          })
          .catch(() => undefined)
      )
  );
};

/**
 * Makes the pinned DXVK build available under the managed directory. Only the
 * DXVK artifact is downloaded: the Wine runtime state is read and updated, so
 * an existing Wine install is never fetched again.
 */
export const ensureDxvkInstalled = async ({
  managedDirectory,
  onProgress,
  download = downloadVerified,
}: EnsureDxvkInstalledOptions): Promise<string> => {
  const state = readWineRuntimeState(managedDirectory);
  if (!state) {
    throw new Error("DXVK cannot be installed before the Wine runtime");
  }

  const installed = findInstalledDxvkDirectory(
    managedDirectory,
    state.dxvkVersion
  );
  if (installed) {
    await removeOtherDxvkVersions(managedDirectory, dxvkManifest.version);
    return installed;
  }

  const { version, artifact } = dxvkManifest;
  const archivePath = path.join(
    getDxvkRoot(managedDirectory),
    `.${artifact.fileName}.${randomUUID()}.download`
  );

  try {
    await download({
      url: artifact.url,
      sha256: artifact.sha256,
      maxBytes: Math.ceil(artifact.sizeBytes * DOWNLOAD_SIZE_HEADROOM),
      destination: archivePath,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      onProgress,
    });

    const versionDir = getDxvkVersionDirectory(managedDirectory, version);
    await installDxvkArchive({ archivePath, versionDir });
    await writeWineRuntimeState(managedDirectory, {
      ...state,
      dxvkVersion: version,
    });
    await removeOtherDxvkVersions(managedDirectory, version);
    return versionDir;
  } finally {
    await fs.promises.rm(archivePath, { force: true }).catch(() => undefined);
  }
};
