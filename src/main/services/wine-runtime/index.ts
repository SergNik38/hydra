import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "@main/services";
import { SystemPath } from "../system-path";
import { downloadVerified, type DownloadProgressCallback } from "./download";
import {
  DXVK_DIRECTORY_NAME,
  ensureDxvkInstalled,
  findInstalledDxvkDirectory,
} from "./dxvk";
import { installArchive } from "./install";
import { dxvkManifest, redistManifest, wineRuntimeManifest } from "./manifest";
import {
  ensureRedistDownloaded,
  findInstalledRedistDirectory,
  REDIST_DIRECTORY_NAME,
} from "./redist";
import { isRosettaAvailable, needsRosetta } from "./rosetta";
import { readWineRuntimeState, writeWineRuntimeState } from "./state";

export type WineRuntimeStatus =
  | "unsupported"
  | "missing"
  | "installing"
  | "ready"
  | "needs-rosetta";

const MANAGED_DIRECTORY_NAME = "wine-runtime";
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const DOWNLOAD_SIZE_HEADROOM = 1.25;

const isSupported = () => process.platform === "darwin";

const getManagedDirectory = () =>
  path.join(SystemPath.getPath("userData"), MANAGED_DIRECTORY_NAME);

const isExecutableFile = (filePath: string) => {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && (stat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
};

const resolveInstalledBinaryPath = (): string | null => {
  const state = readWineRuntimeState(getManagedDirectory());
  if (!state || state.version !== wineRuntimeManifest.version) return null;

  const versionDirectory = path.join(getManagedDirectory(), state.version);
  const binaryPath = path.resolve(versionDirectory, state.binaryRelativePath);
  if (!binaryPath.startsWith(`${versionDirectory}${path.sep}`)) return null;

  return isExecutableFile(binaryPath) ? binaryPath : null;
};

const removeOtherVersions = async (keptVersion: string) => {
  const managedDirectory = getManagedDirectory();
  const entries = await fs.promises
    .readdir(managedDirectory, { withFileTypes: true })
    .catch(() => [] as fs.Dirent[]);

  await Promise.all(
    entries
      .filter(
        (entry) =>
          entry.isDirectory() &&
          entry.name !== keptVersion &&
          entry.name !== DXVK_DIRECTORY_NAME &&
          entry.name !== REDIST_DIRECTORY_NAME
      )
      .map((entry) =>
        fs.promises
          .rm(path.join(managedDirectory, entry.name), {
            recursive: true,
            force: true,
          })
          .catch(() => undefined)
      )
  );
};

export class WineRuntime {
  private static installPromise: Promise<void> | null = null;
  private static redistPromise: Promise<void> | null = null;

  public static async getStatus(): Promise<WineRuntimeStatus> {
    if (!isSupported()) return "unsupported";
    if (this.installPromise) return "installing";
    if (needsRosetta() && !(await isRosettaAvailable())) {
      return "needs-rosetta";
    }
    return resolveInstalledBinaryPath() ? "ready" : "missing";
  }

  public static getWineBinaryPath(): string | null {
    if (!isSupported()) return null;
    return resolveInstalledBinaryPath();
  }

  public static getDxvkDirectory(): string | null {
    if (!isSupported()) return null;

    const managedDirectory = getManagedDirectory();
    const state = readWineRuntimeState(managedDirectory);
    if (!state) return null;

    return findInstalledDxvkDirectory(managedDirectory, state.dxvkVersion);
  }

  public static getRedistDirectory(): string | null {
    if (!isSupported()) return null;

    const managedDirectory = getManagedDirectory();
    const state = readWineRuntimeState(managedDirectory);
    if (!state) return null;

    return findInstalledRedistDirectory(managedDirectory, state.redistVersion);
  }

  public static ensureInstalled(
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    if (!isSupported()) return Promise.resolve();
    this.installPromise ??= this.runInstall(onProgress).finally(() => {
      this.installPromise = null;
    });
    return this.installPromise;
  }

  public static ensureRedistInstalled(
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    if (!isSupported()) return Promise.resolve();
    this.redistPromise ??= this.runRedistInstall(onProgress).finally(() => {
      this.redistPromise = null;
    });
    return this.redistPromise;
  }

  private static async runInstall(
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    const managedDirectory = getManagedDirectory();

    if (!resolveInstalledBinaryPath()) {
      if (needsRosetta() && !(await isRosettaAvailable())) {
        throw new Error(
          "Rosetta 2 is required to run the macOS Wine runtime on Apple Silicon"
        );
      }

      const { version, artifact } = wineRuntimeManifest;
      const archivePath = path.join(
        managedDirectory,
        `.${artifact.fileName}.${randomUUID()}.download`
      );

      try {
        logger.info("Downloading Wine runtime", { version });
        await downloadVerified({
          url: artifact.url,
          sha256: artifact.sha256,
          maxBytes: Math.ceil(artifact.sizeBytes * DOWNLOAD_SIZE_HEADROOM),
          destination: archivePath,
          timeoutMs: DOWNLOAD_TIMEOUT_MS,
          onProgress,
        });

        logger.info("Installing Wine runtime", { version });
        const { binaryRelativePath } = await installArchive({
          archivePath,
          versionDir: path.join(managedDirectory, version),
        });

        await writeWineRuntimeState(managedDirectory, {
          version,
          binaryRelativePath,
          installedAt: Date.now(),
        });
        logger.info("Wine runtime installed", { version, binaryRelativePath });
      } catch (error) {
        logger.warn("Failed to install Wine runtime", {
          version,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        await fs.promises
          .rm(archivePath, { force: true })
          .catch(() => undefined);
      }
    }

    const dxvkMissing = WineRuntime.getDxvkDirectory() === null;

    try {
      if (dxvkMissing) {
        logger.info("Installing DXVK", { version: dxvkManifest.version });
      }
      await ensureDxvkInstalled({ managedDirectory, onProgress });
      if (dxvkMissing) {
        logger.info("DXVK installed", { version: dxvkManifest.version });
      }
    } catch (error) {
      logger.warn("Failed to install DXVK", {
        version: dxvkManifest.version,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    await removeOtherVersions(wineRuntimeManifest.version);
  }

  private static async runRedistInstall(
    onProgress?: DownloadProgressCallback
  ): Promise<void> {
    const managedDirectory = getManagedDirectory();
    const missing = WineRuntime.getRedistDirectory() === null;

    if (missing) {
      logger.info("Installing Windows redistributables", {
        version: redistManifest.version,
      });
    }

    try {
      await ensureRedistDownloaded({ managedDirectory, onProgress });
      if (missing) {
        logger.info("Windows redistributables installed", {
          version: redistManifest.version,
        });
      }
    } catch (error) {
      logger.warn("Failed to install Windows redistributables", {
        version: redistManifest.version,
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
