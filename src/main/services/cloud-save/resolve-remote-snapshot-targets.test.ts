import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

// @ts-ignore The Node ESM test runner requires the source extension.
import { cloudSaveCustomPathContextFromPathContext } from "./custom-path.ts";
// @ts-ignore The Node ESM test runner requires the source extension.
import { isCloudSaveWindowsCompatibilityHost } from "./windows-compatibility-host.ts";

type ResolveModule = {
  resolveRestoreManifestTargets: (
    manifest: unknown,
    pathContext: unknown
  ) => Promise<{
    actions: Array<{ target?: string }>;
    blocked: unknown[];
    deferred: unknown[];
  }>;
};

const WINE_PREFIX =
  "/Users/test/Library/Application Support/hydra/wine-prefixes/Game";

const load = () => {
  const resolveInputs: Array<{ platform: string; winePrefixPath?: string }> =
    [];
  const modules: Record<string, unknown> = {
    "@main/services/hydra-api": { HydraApi: {} },
    "@main/services/logger": { logger: { info: () => {} } },
    "@main/services/system-path": { SystemPath: { getPath: () => "/data" } },
    "@main/services/wine": {
      Wine: {
        validatePrefix: () => true,
        getPrefixUserProfiles: () => ["steamuser"],
      },
    },
    "../native-addon": {
      NativeAddon: {
        getSaveRulesForGame: async () => ({ rules: [] }),
        resolveRestoreTargets: async (input: {
          platform: string;
          winePrefixPath?: string;
        }) => {
          resolveInputs.push(input);
          return {
            actions: [
              {
                kind: "restore",
                target: `${input.winePrefixPath}/drive_c/users/steamuser/Documents/Game/save.dat`,
              },
            ],
            blocked: [],
            deferred: [],
          };
        },
      },
    },
    "./cloud-save-contract": {
      validateRestoreManifest: (value: unknown) => value,
    },
    "./cloud-save-game-context": {
      getCloudSaveGameContext: async () => ({
        game: undefined,
        pathContext: {},
      }),
    },
    "./recompilation-cloud-save": { getRecompilationSaveRules: () => [] },
    "./custom-path": { cloudSaveCustomPathContextFromPathContext },
    "./custom-path-store": {
      customPathToCloudSaveRule: (value: unknown) => value,
    },
    "./custom-path-overlap": {
      getUsableCloudSaveCustomPathBindings: async () => ({ ready: [] }),
    },
    "./emulator-save-provider": {
      emulatorSaveFileKey: () => "",
      getEmulatorRestoreRules: async () => new Map(),
      getEmulatorSaveProvider: () => null,
    },
    "./emulator-provider-identity": { isEmulatorSaveRawPath: () => false },
    "./snapshot-aggregate-hash": { buildCloudSaveAggregateHash: () => "" },
    "./restore-target-collision": {
      blockAmbiguousRestoreTargets: (result: unknown) => result,
    },
    "./emulator-restore-plan": {
      filterUnsafeEmulatorRestoreTargets: (
        _emulator: boolean,
        _context: unknown,
        result: unknown
      ) => result,
    },
    "./windows-compatibility-host.js": { isCloudSaveWindowsCompatibilityHost },
  };
  const context = {} as ResolveModule;
  const compiled = ts.transpileModule(
    fs.readFileSync(
      new URL("./resolve-remote-snapshot-targets.ts", import.meta.url),
      "utf8"
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }
  );
  vm.runInNewContext(compiled.outputText, {
    exports: context,
    require: (specifier: string) =>
      modules[specifier] ?? assert.fail(`Unexpected dependency: ${specifier}`),
  });
  return { context, resolveInputs };
};

const manifest = {
  snapshot: { id: "snapshot", version: 1, objectId: "game", shop: "steam" },
  variants: [{ variantId: "default", kind: "default" }],
  files: [
    {
      rawPath: "<winDocuments>/Game/save.dat",
      relativePath: "save.dat",
      variantId: "default",
      hash: "hash",
      sizeBytes: 1,
      lastModifiedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const winGameContext = (executablePath: string) => ({
  shop: "steam",
  objectId: "game",
  platform: "mac",
  homeDir: "/Users/test",
  executablePath,
  winePrefixPath: WINE_PREFIX,
  storeUserContext: { known: [] },
});

test("macOS Wine games resolve Windows targets through the prefix", async () => {
  const { context, resolveInputs } = load();
  const result = await context.resolveRestoreManifestTargets(
    manifest,
    winGameContext("/Games/Game/Game.exe")
  );

  assert.equal(resolveInputs.length, 1);
  assert.equal(resolveInputs[0].platform, "mac");
  assert.equal(resolveInputs[0].winePrefixPath, WINE_PREFIX);
  assert.equal(
    result.actions[0].target,
    `${WINE_PREFIX}/drive_c/users/steamuser/Documents/Game/save.dat`
  );
});

test("native macOS games resolve without a Wine prefix", async () => {
  const { context, resolveInputs } = load();
  await context.resolveRestoreManifestTargets(
    manifest,
    winGameContext("/Applications/Game.app/Contents/MacOS/Game")
  );

  assert.equal(resolveInputs.length, 1);
  assert.equal(resolveInputs[0].platform, "mac");
  assert.equal(resolveInputs[0].winePrefixPath, undefined);
});
