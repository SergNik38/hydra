import fs from "node:fs";
import { Wine } from "@main/services/wine";
import { WineRuntime } from "@main/services/wine-runtime";
import { killWinePrefix } from "@main/services/wine-runtime/kill-prefix";

interface DarwinWineGame {
  executablePath?: string | null;
  winePrefixPath?: string | null;
  objectId: string;
}

export const isDarwinWineExecutable = (executablePath?: string | null) =>
  process.platform === "darwin" &&
  Boolean(executablePath?.toLowerCase().endsWith(".exe"));

export const closeDarwinWineGame = async ({
  executablePath,
  winePrefixPath,
  objectId,
}: DarwinWineGame): Promise<boolean> => {
  if (!isDarwinWineExecutable(executablePath)) return false;

  const requestedPrefix = Wine.getEffectivePrefixPath(winePrefixPath, objectId);
  const prefixPath =
    (await Wine.resolvePrefixPath(requestedPrefix)) ?? requestedPrefix;
  const wineBinaryPath = WineRuntime.getWineBinaryPath();

  if (
    !prefixPath ||
    !wineBinaryPath ||
    !fs.existsSync(prefixPath) ||
    !fs.existsSync(wineBinaryPath)
  ) {
    return false;
  }

  return killWinePrefix({ wineBinaryPath, prefixPath });
};
