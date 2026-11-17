import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

const MARKER_FILE_NAME = ".hydra-dxvk";
const DLL_OVERRIDES = ["d3d11", "d3d10core"] as const;
const DLL_OVERRIDE_KEY = "HKCU\\Software\\Wine\\DllOverrides";
const DLL_PATTERN = /\.dll$/i;
const REG_TIMEOUT_MS = 60_000;

export type DxvkRegistryRunner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
) => Promise<number>;

export interface EnsurePrefixDxvkOptions {
  wineBinaryPath: string;
  prefixPath: string;
  dxvkDir: string;
  version: string;
  run?: DxvkRegistryRunner;
  onInstall?: () => void;
}

const runRegistryCommand: DxvkRegistryRunner = (command, args, env) =>
  new Promise((resolve) => {
    execFile(command, args, { env, timeout: REG_TIMEOUT_MS }, (error) => {
      if (!error) {
        resolve(0);
        return;
      }
      resolve(typeof error.code === "number" ? error.code : 1);
    });
  });

const getMarkerPath = (prefixPath: string) =>
  path.join(prefixPath, MARKER_FILE_NAME);

const isDirectory = (filePath: string) => {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
};

const readMarker = (prefixPath: string): string | null => {
  try {
    return fs.readFileSync(getMarkerPath(prefixPath), "utf8").trim();
  } catch {
    return null;
  }
};

const copyDlls = async (sourceDirectory: string, targetDirectory: string) => {
  const entries = await fs.promises
    .readdir(sourceDirectory, { withFileTypes: true })
    .catch(() => {
      throw new Error(`DXVK directory is missing: ${sourceDirectory}`);
    });
  const dlls = entries.filter(
    (entry) => entry.isFile() && DLL_PATTERN.test(entry.name)
  );
  if (dlls.length === 0) {
    throw new Error(`DXVK directory has no DLLs: ${sourceDirectory}`);
  }

  await fs.promises.mkdir(targetDirectory, { recursive: true });
  await Promise.all(
    dlls.map((entry) =>
      fs.promises.copyFile(
        path.join(sourceDirectory, entry.name),
        path.join(targetDirectory, entry.name)
      )
    )
  );
};

const applyDllOverrides = async (
  wineBinaryPath: string,
  prefixPath: string,
  run: DxvkRegistryRunner
) => {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WINEPREFIX: prefixPath,
    WINEDEBUG: "-all",
  };

  for (const dll of DLL_OVERRIDES) {
    const exitCode = await run(
      wineBinaryPath,
      [
        "reg",
        "add",
        DLL_OVERRIDE_KEY,
        "/v",
        dll,
        "/t",
        "REG_SZ",
        "/d",
        "native",
        "/f",
      ],
      env
    );

    if (exitCode !== 0) {
      throw new Error(
        `Failed to set the ${dll} DLL override (exit code ${exitCode})`
      );
    }
  }
};

export const isPrefixDxvkInstalled = (
  prefixPath: string,
  version: string
): boolean => readMarker(prefixPath) === version;

export const ensurePrefixDxvk = async ({
  wineBinaryPath,
  prefixPath,
  dxvkDir,
  version,
  run = runRegistryCommand,
  onInstall,
}: EnsurePrefixDxvkOptions): Promise<void> => {
  if (isPrefixDxvkInstalled(prefixPath, version)) return;

  onInstall?.();

  await copyDlls(
    path.join(dxvkDir, "x64"),
    path.join(prefixPath, "drive_c", "windows", "system32")
  );

  const syswow64Path = path.join(prefixPath, "drive_c", "windows", "syswow64");
  if (isDirectory(syswow64Path)) {
    await copyDlls(path.join(dxvkDir, "x32"), syswow64Path);
  }

  await applyDllOverrides(wineBinaryPath, prefixPath, run);
  await fs.promises.writeFile(getMarkerPath(prefixPath), version);
};
