import { logger } from "@main/services";
import { WineRuntime } from "@main/services/wine-runtime";
import { redistManifest } from "@main/services/wine-runtime/manifest";
import { ensurePrefixRedist } from "@main/services/wine-runtime/prefix-redist";
import type { UmuStatus } from "@main/services/umu-launch-monitor";

/**
 * Adds the Microsoft Visual C++ and OpenAL runtimes to one game prefix.
 * A failure only warns: the game may still run, and the next launch retries.
 */
export const prepareDarwinWineRedist = async (
  wineBinaryPath: string,
  prefixPath: string,
  onStatus?: (status: UmuStatus) => void
): Promise<void> => {
  try {
    await WineRuntime.ensureRedistInstalled();

    const redistDir = WineRuntime.getRedistDirectory();
    if (!redistDir) throw new Error("Wine redistributables are not installed");

    const result = await ensurePrefixRedist({
      wineBinaryPath,
      prefixPath,
      redistDir,
      version: redistManifest.version,
      onInstall: () => onStatus?.({ type: "progress", message: "Visual C++" }),
    });

    if (result.error) {
      logger.warn("Failed to install the Windows redistributables", {
        prefixPath,
        errorMessage: result.error,
      });
    }
  } catch (error) {
    logger.warn("Windows redistributables are unavailable", {
      prefixPath,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
};
