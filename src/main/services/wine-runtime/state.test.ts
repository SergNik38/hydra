import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import {
  parseWineRuntimeState,
  readWineRuntimeState,
  writeWineRuntimeState,
} from "./state.ts";

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hydra-wine-state-")
  );
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

describe("wine runtime state", () => {
  it("round-trips a written state", async () => {
    await withTempDir(async (directory) => {
      const state = {
        version: "staging-11.18",
        binaryRelativePath: path.join(
          "Wine Staging.app",
          "Contents",
          "Resources",
          "wine",
          "bin",
          "wine64"
        ),
        installedAt: 1_700_000_000_000,
      };

      await writeWineRuntimeState(directory, state);

      assert.deepEqual(readWineRuntimeState(directory), state);
      assert.deepEqual(await fs.readdir(directory), ["state.json"]);
    });
  });

  it("returns null for a missing state file", async () => {
    await withTempDir(async (directory) => {
      assert.equal(readWineRuntimeState(directory), null);
    });
  });

  it("returns null for invalid JSON", async () => {
    await withTempDir(async (directory) => {
      await fs.writeFile(path.join(directory, "state.json"), "{nope");

      assert.equal(readWineRuntimeState(directory), null);
    });
  });

  it("rejects an invalid state shape", () => {
    assert.equal(parseWineRuntimeState(null), null);
    assert.equal(
      parseWineRuntimeState({
        version: "",
        binaryRelativePath: "wine",
        installedAt: 1,
      }),
      null
    );
    assert.equal(
      parseWineRuntimeState({
        version: "staging-11.18",
        binaryRelativePath: "wine",
        installedAt: Number.NaN,
      }),
      null
    );
  });
});
