import type { UmuStatus } from "@main/services/umu-launch-monitor";
import { WineRuntime } from "@main/services/wine-runtime";
import { ensureWinePrefix } from "@main/services/wine-runtime/prefix";

export const prepareDarwinWinePrefix = async (
  winePrefixPath: string,
  onStatus?: (status: UmuStatus) => void
): Promise<string> => {
  await WineRuntime.ensureInstalled(() =>
    onStatus?.({ type: "progress", message: null })
  );

  const wineBinaryPath = WineRuntime.getWineBinaryPath();
  if (!wineBinaryPath) throw new Error("Wine runtime is not installed");

  await ensureWinePrefix({ wineBinaryPath, prefixPath: winePrefixPath });

  return wineBinaryPath;
};
