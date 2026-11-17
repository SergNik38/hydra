import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { redistManifest } from "./manifest.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import {
  ensurePrefixRedist,
  isPrefixRedistInstalled,
} from "./prefix-redist.ts";

const WINE_BINARY_PATH = "/managed/wine/bin/wine64";
const WINESERVER_PATH = "/managed/wine/bin/wineserver";
const VERSION = redistManifest.version;
const MARKER_PATH = ".hydra-redist";

const EXPECTED_COMMANDS = [
  ["VisualCppRedist_AIO_x86_x64.exe", "/ai", "/gm2"],
  ["oalinst.exe", "/silent"],
  ["-w"],
];

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hydra-prefix-redist-")
  );
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

interface RecordedCall {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

const createRunner = (calls: RecordedCall[], exitCode = 0) => {
  return async (
    command: string,
    args: string[],
    options: { cwd: string; env: NodeJS.ProcessEnv }
  ) => {
    calls.push({ command, args, cwd: options.cwd, env: options.env });
    return exitCode;
  };
};

describe("ensurePrefixRedist", () => {
  it("runs both installers, flushes them and writes the marker", async () => {
    await withTempDir(async (directory) => {
      const prefixPath = path.join(directory, "prefix");
      const redistDir = path.join(directory, "redist", VERSION);
      await fs.mkdir(prefixPath, { recursive: true });

      const calls: RecordedCall[] = [];
      let installs = 0;

      const result = await ensurePrefixRedist({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        redistDir,
        version: VERSION,
        onInstall: () => {
          installs += 1;
        },
        run: createRunner(calls),
      });

      assert.deepEqual(result, { installed: true });
      assert.equal(installs, 1);
      assert.deepEqual(
        calls.map((call) => call.args),
        EXPECTED_COMMANDS
      );
      assert.equal(calls[0].command, WINE_BINARY_PATH);
      assert.equal(calls[1].command, WINE_BINARY_PATH);
      assert.equal(calls[2].command, WINESERVER_PATH);

      for (const call of calls) {
        assert.equal(call.cwd, redistDir);
        assert.equal(call.env.WINEPREFIX, prefixPath);
        assert.equal(call.env.WINEDEBUG, "-all");
      }

      assert.equal(
        await fs.readFile(path.join(prefixPath, MARKER_PATH), "utf8"),
        VERSION
      );
      assert.equal(isPrefixRedistInstalled(prefixPath, VERSION), true);
    });
  });

  it("is a no-op when the marker matches the version", async () => {
    await withTempDir(async (directory) => {
      const prefixPath = path.join(directory, "prefix");
      await fs.mkdir(prefixPath, { recursive: true });
      await fs.writeFile(path.join(prefixPath, MARKER_PATH), VERSION);

      const calls: RecordedCall[] = [];
      let installs = 0;

      const result = await ensurePrefixRedist({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        redistDir: path.join(directory, "redist", VERSION),
        version: VERSION,
        onInstall: () => {
          installs += 1;
        },
        run: createRunner(calls),
      });

      assert.deepEqual(result, { installed: false });
      assert.equal(calls.length, 0);
      assert.equal(installs, 0);
    });
  });

  it("re-runs when the marker has another version", async () => {
    await withTempDir(async (directory) => {
      const prefixPath = path.join(directory, "prefix");
      await fs.mkdir(prefixPath, { recursive: true });
      await fs.writeFile(path.join(prefixPath, MARKER_PATH), "older-version");

      const calls: RecordedCall[] = [];

      const result = await ensurePrefixRedist({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        redistDir: path.join(directory, "redist", VERSION),
        version: VERSION,
        run: createRunner(calls),
      });

      assert.equal(result.installed, true);
      assert.equal(calls.length, EXPECTED_COMMANDS.length);
      assert.equal(
        await fs.readFile(path.join(prefixPath, MARKER_PATH), "utf8"),
        VERSION
      );
    });
  });

  it("reports a failed installer and leaves no marker", async () => {
    await withTempDir(async (directory) => {
      const prefixPath = path.join(directory, "prefix");
      await fs.mkdir(prefixPath, { recursive: true });

      const calls: RecordedCall[] = [];

      const result = await ensurePrefixRedist({
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        redistDir: path.join(directory, "redist", VERSION),
        version: VERSION,
        run: createRunner(calls, 1),
      });

      assert.equal(result.installed, false);
      assert.match(result.error ?? "", /exit code 1/);
      assert.equal(calls.length, 1);
      await assert.rejects(
        fs.stat(path.join(prefixPath, MARKER_PATH)),
        /ENOENT/
      );
    });
  });

  it("runs the installers once for concurrent calls on one prefix", async () => {
    await withTempDir(async (directory) => {
      const prefixPath = path.join(directory, "prefix");
      await fs.mkdir(prefixPath, { recursive: true });

      const calls: RecordedCall[] = [];
      let installs = 0;
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      const options = {
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        redistDir: path.join(directory, "redist", VERSION),
        version: VERSION,
        onInstall: () => {
          installs += 1;
        },
        run: async (
          command: string,
          args: string[],
          commandOptions: { cwd: string; env: NodeJS.ProcessEnv }
        ) => {
          calls.push({
            command,
            args,
            cwd: commandOptions.cwd,
            env: commandOptions.env,
          });
          await gate;
          return 0;
        },
      };

      const first = ensurePrefixRedist(options);
      const second = ensurePrefixRedist(options);
      const third = ensurePrefixRedist(options);
      release();

      assert.deepEqual(await Promise.all([first, second, third]), [
        { installed: true },
        { installed: true },
        { installed: true },
      ]);
      assert.equal(installs, 1);
      assert.deepEqual(
        calls.map((call) => call.args),
        EXPECTED_COMMANDS
      );
      assert.equal(
        await fs.readFile(path.join(prefixPath, MARKER_PATH), "utf8"),
        VERSION
      );
    });
  });

  it("installs into two prefixes in parallel", async () => {
    await withTempDir(async (directory) => {
      const calls: RecordedCall[] = [];
      const prefixes = ["prefix-a", "prefix-b"];
      for (const name of prefixes) {
        await fs.mkdir(path.join(directory, name), { recursive: true });
      }

      const results = await Promise.all(
        prefixes.map((name) =>
          ensurePrefixRedist({
            wineBinaryPath: WINE_BINARY_PATH,
            prefixPath: path.join(directory, name),
            redistDir: path.join(directory, "redist", VERSION),
            version: VERSION,
            run: createRunner(calls),
          })
        )
      );

      assert.deepEqual(results, [{ installed: true }, { installed: true }]);
      assert.equal(calls.length, EXPECTED_COMMANDS.length * prefixes.length);
      for (const name of prefixes) {
        assert.equal(
          await fs.readFile(path.join(directory, name, MARKER_PATH), "utf8"),
          VERSION
        );
      }
    });
  });

  it("retries on the next call after a failure", async () => {
    await withTempDir(async (directory) => {
      const prefixPath = path.join(directory, "prefix");
      await fs.mkdir(prefixPath, { recursive: true });
      const options = {
        wineBinaryPath: WINE_BINARY_PATH,
        prefixPath,
        redistDir: path.join(directory, "redist", VERSION),
        version: VERSION,
      };

      const failed = await ensurePrefixRedist({
        ...options,
        run: createRunner([], 1),
      });
      assert.equal(failed.installed, false);

      const calls: RecordedCall[] = [];
      const retried = await ensurePrefixRedist({
        ...options,
        run: createRunner(calls),
      });

      assert.deepEqual(retried, { installed: true });
      assert.equal(calls.length, EXPECTED_COMMANDS.length);
    });
  });
});
