import type { UmuStatus } from "@main/services/umu-launch-monitor";
import { WineRuntime } from "@main/services/wine-runtime";
import { dxvkManifest } from "@main/services/wine-runtime/manifest";
import { ensureWinePrefix } from "@main/services/wine-runtime/prefix";
import { ensurePrefixDxvk } from "@main/services/wine-runtime/prefix-dxvk";
import { createWineRuntimeProgressReporter } from "./wine-runtime-progress";

export const prepareDarwinWinePrefix = async (
  winePrefixPath: string,
  onStatus?: (status: UmuStatus) => void
): Promise<string> => {
  await WineRuntime.ensureInstalled(
    createWineRuntimeProgressReporter((message) =>
      onStatus?.({ type: "progress", message })
    )
  );

  const wineBinaryPath = WineRuntime.getWineBinaryPath();
  if (!wineBinaryPath) throw new Error("Wine runtime is not installed");

  onStatus?.({ type: "progress", message: "Wine prefix" });
  await ensureWinePrefix({ wineBinaryPath, prefixPath: winePrefixPath });

  const dxvkDirectory = WineRuntime.getDxvkDirectory();
  if (!dxvkDirectory) throw new Error("DXVK runtime is not installed");

  await ensurePrefixDxvk({
    wineBinaryPath,
    prefixPath: winePrefixPath,
    dxvkDir: dxvkDirectory,
    version: dxvkManifest.version,
    onInstall: () => onStatus?.({ type: "progress", message: "DXVK" }),
  });

  return wineBinaryPath;
};
