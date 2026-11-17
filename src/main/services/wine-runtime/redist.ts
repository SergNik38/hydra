import fs from "node:fs";
import path from "node:path";
import {
  downloadVerified,
  type DownloadProgressCallback,
  type DownloadVerifiedOptions,
} from "./download.js";
import { redistManifest, type WineRedistInstaller } from "./manifest.js";
import { readWineRuntimeState, writeWineRuntimeState } from "./state.js";

export const REDIST_DIRECTORY_NAME = "redist";
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const DOWNLOAD_SIZE_HEADROOM = 1.25;
const READY_MARKER_SUFFIX = ".ok";

export type RedistDownloader = (
  options: DownloadVerifiedOptions
) => Promise<void>;

export interface EnsureRedistDownloadedOptions {
  managedDirectory: string;
  onProgress?: DownloadProgressCallback;
  download?: RedistDownloader;
}

export const getRedistRoot = (managedDirectory: string) =>
  path.join(managedDirectory, REDIST_DIRECTORY_NAME);

export const getRedistVersionDirectory = (
  managedDirectory: string,
  version: string
) => path.join(getRedistRoot(managedDirectory), version);

const getReadyMarkerPath = (
  directory: string,
  installer: WineRedistInstaller
) => path.join(directory, `${installer.fileName}${READY_MARKER_SUFFIX}`);

const isInstallerReady = (
  directory: string,
  installer: WineRedistInstaller
): boolean => {
  try {
    return (
      fs.statSync(path.join(directory, installer.fileName)).isFile() &&
      fs
        .readFileSync(getReadyMarkerPath(directory, installer), "utf8")
        .trim() === installer.sha256
    );
  } catch {
    return false;
  }
};

const markInstallerReady = async (
  directory: string,
  installer: WineRedistInstaller
) => {
  await fs.promises.writeFile(
    getReadyMarkerPath(directory, installer),
    installer.sha256
  );
};

export const findInstalledRedistDirectory = (
  managedDirectory: string,
  redistVersion: string | undefined
): string | null => {
  if (!redistVersion || redistVersion !== redistManifest.version) return null;
  const directory = getRedistVersionDirectory(managedDirectory, redistVersion);
  const complete = redistManifest.installers.every((installer) =>
    isInstallerReady(directory, installer)
  );
  return complete ? directory : null;
};

export const removeOtherRedistVersions = async (
  managedDirectory: string,
  keptVersion: string
) => {
  const redistRoot = getRedistRoot(managedDirectory);
  const entries = await fs.promises
    .readdir(redistRoot, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== keptVersion)
      .map((entry) =>
        fs.promises
          .rm(path.join(redistRoot, entry.name), {
            recursive: true,
            force: true,
          })
          .catch(() => undefined)
      )
  );
};

/**
 * Makes the pinned Visual C++ and OpenAL installers available under the managed
 * directory. Only the redistributable files are downloaded: the Wine runtime
 * state is read and updated, so an existing Wine or DXVK install is never
 * fetched again.
 */
export const ensureRedistDownloaded = async ({
  managedDirectory,
  onProgress,
  download = downloadVerified,
}: EnsureRedistDownloadedOptions): Promise<string> => {
  const state = readWineRuntimeState(managedDirectory);
  if (!state) {
    throw new Error(
      "Redistributables cannot be installed before the Wine runtime"
    );
  }

  const installed = findInstalledRedistDirectory(
    managedDirectory,
    state.redistVersion
  );
  if (installed) {
    await removeOtherRedistVersions(managedDirectory, redistManifest.version);
    return installed;
  }

  const { version, installers } = redistManifest;
  const versionDirectory = getRedistVersionDirectory(managedDirectory, version);
  await fs.promises.mkdir(versionDirectory, { recursive: true });

  for (const installer of installers) {
    if (isInstallerReady(versionDirectory, installer)) continue;

    await download({
      url: installer.url,
      sha256: installer.sha256,
      maxBytes: Math.ceil(installer.sizeBytes * DOWNLOAD_SIZE_HEADROOM),
      destination: path.join(versionDirectory, installer.fileName),
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
      onProgress,
    });
    await markInstallerReady(versionDirectory, installer);
  }

  await writeWineRuntimeState(managedDirectory, {
    ...state,
    redistVersion: version,
  });
  await removeOtherRedistVersions(managedDirectory, version);
  return versionDirectory;
};
