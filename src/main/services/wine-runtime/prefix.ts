import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const WINEBOOT_TIMEOUT_MS = 5 * 60 * 1000;

export type WinebootRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
) => Promise<number>;

export interface EnsureWinePrefixOptions {
  wineBinaryPath: string;
  prefixPath: string;
  run?: WinebootRunner;
}

const runWineboot: WinebootRunner = (command, args, env) =>
  new Promise((resolve) => {
    execFile(command, args, { env, timeout: WINEBOOT_TIMEOUT_MS }, (error) => {
      if (!error) {
        resolve(0);
        return;
      }
      resolve(typeof error.code === "number" ? error.code : 1);
    });
  });

const getSystemRegPath = (prefixPath: string) =>
  path.join(prefixPath, "system.reg");

const isFile = (filePath: string) => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

export const isWinePrefixInitialized = (prefixPath: string): boolean =>
  isFile(getSystemRegPath(prefixPath));

export const ensureWinePrefix = async ({
  wineBinaryPath,
  prefixPath,
  run = runWineboot,
}: EnsureWinePrefixOptions): Promise<void> => {
  if (isWinePrefixInitialized(prefixPath)) return;

  await fs.promises.mkdir(prefixPath, { recursive: true });

  const exitCode = await run(wineBinaryPath, ["wineboot", "--init"], {
    ...process.env,
    WINEPREFIX: prefixPath,
    WINEDEBUG: "-all",
  });

  if (exitCode !== 0) {
    throw new Error(`wineboot --init failed with exit code ${exitCode}`);
  }

  if (!isWinePrefixInitialized(prefixPath)) {
    throw new Error("wineboot --init did not initialize the Wine prefix");
  }
};
