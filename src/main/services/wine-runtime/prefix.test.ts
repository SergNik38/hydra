import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { ensureWinePrefix, isWinePrefixInitialized } from "./prefix.ts";

const WINE_BINARY_PATH = "/managed/wine/bin/wine64";

const withTempDir = (run: (directory: string) => Promise<void>) => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "hydra-wine-prefix-")
  );

  return run(directory).finally(() => {
    fs.rmSync(directory, { recursive: true, force: true });
  });
};

describe("isWinePrefixInitialized", () => {
  it("is false when system.reg is missing", async () => {
    await withTempDir(async (directory) => {
      assert.equal(isWinePrefixInitialized(directory), false);
    });
  });

  it("is true when system.reg is a file", async () => {
    await withTempDir(async (directory) => {
      fs.writeFileSync(path.join(directory, "system.reg"), "");

      assert.equal(isWinePrefixInitialized(directory), true);
    });
  });
});

describe("ensureWinePrefix", () => {
  it("skips wineboot when the prefix is already initialized", async () => {
    await withTempDir(async (directory) => {
      fs.writeFileSync(path.join(directory, "system.reg"), "");
      let calls = 0;

      await ensureWinePrefix({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath: directory,
        run: async () => {
          calls += 1;
          return 0;
        },
      });

      assert.equal(calls, 0);
    });
  });

  it("runs wineboot --init with the prefix environment", async () => {
    await withTempDir(async (baseDirectory) => {
      const prefixPath = path.join(baseDirectory, "prefix");
      const calls: {
        command: string;
        args: string[];
        env: NodeJS.ProcessEnv;
      }[] = [];

      await ensureWinePrefix({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        run: async (command, args, env) => {
          calls.push({ command, args, env });
          fs.writeFileSync(path.join(prefixPath, "system.reg"), "");
          return 0;
        },
      });

      assert.equal(calls.length, 1);
      assert.equal(calls[0].command, WINE_BINARY_PATH);
      assert.deepEqual(calls[0].args, ["wineboot", "--init"]);
      assert.equal(calls[0].env.WINEPREFIX, prefixPath);
      assert.equal(calls[0].env.WINEDEBUG, "-all");
    });
  });

  it("rejects when wineboot exits non-zero", async () => {
    await withTempDir(async (baseDirectory) => {
      const prefixPath = path.join(baseDirectory, "prefix");

      await assert.rejects(
        ensureWinePrefix({
          wineBinaryPath: WINE_BINARY_PATH,
          prefixPath,
          run: async () => 1,
        }),
        /exit code 1/
      );
    });
  });

  it("rejects when wineboot exits zero without writing system.reg", async () => {
    await withTempDir(async (baseDirectory) => {
      const prefixPath = path.join(baseDirectory, "prefix");

      await assert.rejects(
        ensureWinePrefix({
          wineBinaryPath: WINE_BINARY_PATH,
          prefixPath,
          run: async () => 0,
        }),
        /did not initialize/
      );
    });
  });
});
