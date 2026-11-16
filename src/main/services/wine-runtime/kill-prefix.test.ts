import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { getWineserverPath, killWinePrefix } from "./kill-prefix.ts";

describe("getWineserverPath", () => {
  it("resolves wineserver next to the Wine binary", () => {
    assert.equal(
      getWineserverPath("/opt/wine-runtime/10.0/bin/wine64"),
      "/opt/wine-runtime/10.0/bin/wineserver"
    );
  });
});

describe("killWinePrefix", () => {
  it("runs wineserver -k with the prefix in the environment", async () => {
    let command = "";
    let args: string[] = [];
    let env: NodeJS.ProcessEnv = {};

    const killed = await killWinePrefix({
      wineBinaryPath: "/opt/wine-runtime/10.0/bin/wine64",
      prefixPath: "/prefixes/game",
      run: async (runCommand, runArgs, runEnv) => {
        command = runCommand;
        args = runArgs;
        env = runEnv;
        return 0;
      },
    });

    assert.equal(killed, true);
    assert.equal(command, "/opt/wine-runtime/10.0/bin/wineserver");
    assert.deepEqual(args, ["-k"]);
    assert.equal(env.WINEPREFIX, "/prefixes/game");
  });

  it("returns false on a non-zero exit", async () => {
    assert.equal(
      await killWinePrefix({
        wineBinaryPath: "/wine/bin/wine",
        prefixPath: "/prefixes/game",
        run: async () => 1,
      }),
      false
    );
  });

  it("returns false when the runner throws", async () => {
    assert.equal(
      await killWinePrefix({
        wineBinaryPath: "/wine/bin/wine",
        prefixPath: "/prefixes/game",
        run: async () => {
          throw new Error("spawn failed");
        },
      }),
      false
    );
  });
});
