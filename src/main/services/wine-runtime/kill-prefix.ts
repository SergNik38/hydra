import { execFile } from "node:child_process";
import path from "node:path";

const KILL_TIMEOUT_MS = 15_000;

export type WineserverRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
) => Promise<number>;

const runWineserver: WineserverRunner = (command, args, env) =>
  new Promise((resolve) => {
    execFile(command, args, { env, timeout: KILL_TIMEOUT_MS }, (error) => {
      if (!error) {
        resolve(0);
        return;
      }
      resolve(typeof error.code === "number" ? error.code : 1);
    });
  });

export const getWineserverPath = (wineBinaryPath: string) =>
  path.join(path.dirname(wineBinaryPath), "wineserver");

export const killWinePrefix = async ({
  wineBinaryPath,
  prefixPath,
  run = runWineserver,
}: {
  wineBinaryPath: string;
  prefixPath: string;
  run?: WineserverRunner;
}): Promise<boolean> => {
  try {
    const exitCode = await run(getWineserverPath(wineBinaryPath), ["-k"], {
      ...process.env,
      WINEPREFIX: prefixPath,
    });

    return exitCode === 0;
  } catch {
    return false;
  }
};
