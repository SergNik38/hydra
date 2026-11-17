import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { ensurePrefixDxvk, isPrefixDxvkInstalled } from "./prefix-dxvk.ts";

const WINE_BINARY_PATH = "/managed/wine/bin/wine64";
const VERSION = "1.10.3-20230507-repack";
const DLLS = ["d3d11.dll", "d3d10core.dll"] as const;
const MARKER_CONTENT = VERSION;

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hydra-prefix-dxvk-")
  );
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

const writeFixture = async (root: string, relativePath: string) => {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, "fixture");
};

const createDxvkDirectory = async (root: string) => {
  for (const architecture of ["x64", "x32"]) {
    for (const dll of DLLS) {
      await writeFixture(root, path.join(architecture, dll));
    }
  }
  return root;
};

const createPrefix = async (prefixPath: string, syswow64 = true) => {
  await fs.mkdir(path.join(prefixPath, "drive_c", "windows", "system32"), {
    recursive: true,
  });
  if (syswow64) {
    await fs.mkdir(path.join(prefixPath, "drive_c", "windows", "syswow64"), {
      recursive: true,
    });
  }
};

const getWindowsDirectory = (prefixPath: string, name: string) =>
  path.join(prefixPath, "drive_c", "windows", name);

describe("ensurePrefixDxvk", () => {
  it("copies both architectures and applies the DLL overrides", async () => {
    await withTempDir(async (directory) => {
      const dxvkDir = await createDxvkDirectory(path.join(directory, "dxvk"));
      const prefixPath = path.join(directory, "prefix");
      await createPrefix(prefixPath);

      const calls: {
        command: string;
        args: string[];
        env: NodeJS.ProcessEnv;
      }[] = [];
      let installs = 0;

      await ensurePrefixDxvk({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        dxvkDir,
        version: VERSION,
        onInstall: () => {
          installs += 1;
        },
        run: async (command, args, env) => {
          calls.push({ command, args, env });
          return 0;
        },
      });

      assert.equal(installs, 1);
      for (const name of ["system32", "syswow64"]) {
        assert.deepEqual(
          (await fs.readdir(getWindowsDirectory(prefixPath, name))).sort(),
          [...DLLS].sort()
        );
      }

      assert.equal(calls.length, 2);
      assert.equal(calls[0].command, WINE_BINARY_PATH);
      assert.deepEqual(calls[0].args, [
        "reg",
        "add",
        "HKCU\\Software\\Wine\\DllOverrides",
        "/v",
        "d3d11",
        "/t",
        "REG_SZ",
        "/d",
        "native",
        "/f",
      ]);
      assert.equal(calls[1].args[4], "d3d10core");
      assert.equal(calls[0].env.WINEPREFIX, prefixPath);
      assert.equal(calls[0].env.WINEDEBUG, "-all");

      assert.equal(
        await fs.readFile(path.join(prefixPath, ".hydra-dxvk"), "utf8"),
        MARKER_CONTENT
      );
      assert.equal(isPrefixDxvkInstalled(prefixPath, VERSION), true);
    });
  });

  it("is a no-op when the marker matches the version", async () => {
    await withTempDir(async (directory) => {
      const dxvkDir = await createDxvkDirectory(path.join(directory, "dxvk"));
      const prefixPath = path.join(directory, "prefix");
      await createPrefix(prefixPath);
      await fs.writeFile(path.join(prefixPath, ".hydra-dxvk"), VERSION);

      let calls = 0;
      let installs = 0;

      await ensurePrefixDxvk({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        dxvkDir,
        version: VERSION,
        onInstall: () => {
          installs += 1;
        },
        run: async () => {
          calls += 1;
          return 0;
        },
      });

      assert.equal(calls, 0);
      assert.equal(installs, 0);
    });
  });

  it("re-applies when the marker has another version", async () => {
    await withTempDir(async (directory) => {
      const dxvkDir = await createDxvkDirectory(path.join(directory, "dxvk"));
      const prefixPath = path.join(directory, "prefix");
      await createPrefix(prefixPath);
      await fs.writeFile(path.join(prefixPath, ".hydra-dxvk"), "older-version");

      const overrides: string[] = [];
      let installs = 0;

      await ensurePrefixDxvk({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        dxvkDir,
        version: VERSION,
        onInstall: () => {
          installs += 1;
        },
        run: async (_command, args) => {
          overrides.push(args[4]);
          return 0;
        },
      });

      assert.equal(installs, 1);
      assert.deepEqual(overrides, ["d3d11", "d3d10core"]);
      assert.equal(
        await fs.readFile(path.join(prefixPath, ".hydra-dxvk"), "utf8"),
        MARKER_CONTENT
      );
    });
  });

  it("skips syswow64 when the prefix has no such directory", async () => {
    await withTempDir(async (directory) => {
      const dxvkDir = await createDxvkDirectory(path.join(directory, "dxvk"));
      const prefixPath = path.join(directory, "prefix");
      await createPrefix(prefixPath, false);

      await ensurePrefixDxvk({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        dxvkDir,
        version: VERSION,
        run: async () => 0,
      });

      assert.deepEqual(
        (await fs.readdir(getWindowsDirectory(prefixPath, "system32"))).sort(),
        [...DLLS].sort()
      );
      await assert.rejects(
        fs.stat(getWindowsDirectory(prefixPath, "syswow64")),
        /ENOENT/
      );
    });
  });

  it("throws and leaves no marker when an override fails", async () => {
    await withTempDir(async (directory) => {
      const dxvkDir = await createDxvkDirectory(path.join(directory, "dxvk"));
      const prefixPath = path.join(directory, "prefix");
      await createPrefix(prefixPath);

      await assert.rejects(
        ensurePrefixDxvk({
          wineBinaryPath: WINE_BINARY_PATH,
          prefixPath,
          dxvkDir,
          version: VERSION,
          run: async () => 1,
        }),
        /exit code 1/
      );

      await assert.rejects(
        fs.stat(path.join(prefixPath, ".hydra-dxvk")),
        /ENOENT/
      );
    });
  });
});
