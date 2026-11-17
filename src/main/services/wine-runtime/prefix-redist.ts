import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { redistManifest } from "./manifest.js";
import { runSingleFlight } from "./single-flight.js";

const MARKER_FILE_NAME = ".hydra-redist";
const WINESERVER_BINARY_NAME = "wineserver";
const INSTALL_TIMEOUT_MS = 5 * 60 * 1000;

export interface RedistCommandOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export type RedistRunner = (
  command: string,
  args: string[],
  options: RedistCommandOptions
) => Promise<number>;

export interface EnsurePrefixRedistOptions {
  wineBinaryPath: string;
  prefixPath: string;
  redistDir: string;
  version: string;
  run?: RedistRunner;
  onInstall?: () => void;
}

export interface PrefixRedistResult {
  installed: boolean;
  error?: string;
}

const runInstallCommand: RedistRunner = (command, args, { cwd, env }) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd, env, timeout: INSTALL_TIMEOUT_MS },
      (error) => {
        if (!error) {
          resolve(0);
          return;
        }
        resolve(typeof error.code === "number" ? error.code : 1);
      }
    );
  });

const getMarkerPath = (prefixPath: string) =>
  path.join(prefixPath, MARKER_FILE_NAME);

const readMarker = (prefixPath: string): string | null => {
  try {
    return fs.readFileSync(getMarkerPath(prefixPath), "utf8").trim();
  } catch {
    return null;
  }
};

export const isPrefixRedistInstalled = (
  prefixPath: string,
  version: string
): boolean => readMarker(prefixPath) === version;

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * Installs the pinned Visual C++ and OpenAL runtimes into one Wine prefix.
 * Failures are reported instead of thrown: a game can still start without
 * them, and the missing marker makes the next launch retry.
 */
const installPrefixRedist = async ({
  wineBinaryPath,
  prefixPath,
  redistDir,
  version,
  run = runInstallCommand,
  onInstall,
}: EnsurePrefixRedistOptions): Promise<PrefixRedistResult> => {
  if (isPrefixRedistInstalled(prefixPath, version)) return { installed: false };

  onInstall?.();

  const options: RedistCommandOptions = {
    cwd: redistDir,
    env: {
      ...process.env,
      WINEPREFIX: prefixPath,
      WINEDEBUG: "-all",
    },
  };

  try {
    for (const installer of redistManifest.installers) {
      const exitCode = await run(
        wineBinaryPath,
        [installer.fileName, ...installer.args],
        options
      );

      // Every non-zero code stays a failure, including the 8 the Visual C++
      // SFX returns when another installer already runs in the prefix: it is
      // not a documented success/already-installed code (the package only
      // documents switches, https://github.com/abbodi1406/vcredist), and the
      // same command returns 0 when it runs alone.
      if (exitCode !== 0) {
        throw new Error(
          `${installer.fileName} failed with exit code ${exitCode}`
        );
      }
    }

    const wineserverPath = path.join(
      path.dirname(wineBinaryPath),
      WINESERVER_BINARY_NAME
    );
    const flushExitCode = await run(wineserverPath, ["-w"], options);
    if (flushExitCode !== 0) {
      throw new Error(`wineserver -w failed with exit code ${flushExitCode}`);
    }

    await fs.promises.writeFile(getMarkerPath(prefixPath), version);
    return { installed: true };
  } catch (error) {
    return { installed: false, error: toErrorMessage(error) };
  }
};

/**
 * One install per prefix at a time: overlapping launches of the same game
 * must not run two installers in one prefix, which makes the Visual C++ SFX
 * fail (exit code 8) or hang until the timeout.
 */
export const ensurePrefixRedist = (
  options: EnsurePrefixRedistOptions
): Promise<PrefixRedistResult> =>
  runSingleFlight(`redist:${path.resolve(options.prefixPath)}`, () =>
    installPrefixRedist(options)
  );
