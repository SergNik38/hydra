import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { getMacVolumes } from "./mac-drives.ts";

async function withTempVolumesDir(
  run: (volumesDir: string) => Promise<void>
): Promise<void> {
  const volumesDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "hydra-mac-volumes-")
  );

  try {
    await run(volumesDir);
  } finally {
    await fs.rm(volumesDir, { recursive: true, force: true });
  }
}

describe("getMacVolumes", () => {
  it("lists the boot volume first and external volumes sorted by label", async () => {
    await withTempVolumesDir(async (volumesDir) => {
      await fs.symlink("/", path.join(volumesDir, "Macintosh HD"));
      await fs.mkdir(path.join(volumesDir, "External"));
      await fs.writeFile(path.join(volumesDir, ".hidden"), "ignored");
      await fs.symlink(
        "/hydra-nonexistent-volume",
        path.join(volumesDir, "Dangling")
      );

      assert.deepEqual(await getMacVolumes(volumesDir), [
        { root: "/", label: "Macintosh HD" },
        { root: `${volumesDir}/External`, label: "External" },
      ]);
    });
  });

  it("sorts external volumes by label", async () => {
    await withTempVolumesDir(async (volumesDir) => {
      await fs.mkdir(path.join(volumesDir, "Zeta"));
      await fs.mkdir(path.join(volumesDir, "Alpha"));

      assert.deepEqual(await getMacVolumes(volumesDir), [
        { root: "/", label: "/" },
        { root: `${volumesDir}/Alpha`, label: "Alpha" },
        { root: `${volumesDir}/Zeta`, label: "Zeta" },
      ]);
    });
  });

  it("falls back to the root volume when the volumes directory is missing", async () => {
    await withTempVolumesDir(async (volumesDir) => {
      const missingDir = path.join(volumesDir, "missing");

      assert.deepEqual(await getMacVolumes(missingDir), [
        { root: "/", label: "/" },
      ]);
    });
  });
});
