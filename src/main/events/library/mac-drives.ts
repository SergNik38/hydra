import fs from "node:fs/promises";

export interface MacVolume {
  root: string;
  label: string;
}

const BOOT_VOLUME: MacVolume = { root: "/", label: "/" };

export async function getMacVolumes(
  volumesDir = "/Volumes"
): Promise<MacVolume[]> {
  const entries = await fs.readdir(volumesDir).catch(() => null);
  if (!entries) return [{ ...BOOT_VOLUME }];

  const resolvedEntries = await Promise.all(
    entries
      .filter((name) => !name.startsWith("."))
      .map(async (name) => ({
        name,
        realPath: await fs.realpath(`${volumesDir}/${name}`).catch(() => null),
      }))
  );

  const volumes: MacVolume[] = [];
  let bootVolume: MacVolume | null = null;

  for (const { name, realPath } of resolvedEntries) {
    if (!realPath) continue;

    // The boot volume is mounted at /Volumes/<name> as a symlink to the root.
    if (realPath === "/") {
      bootVolume ??= { root: "/", label: name };
      continue;
    }

    volumes.push({ root: `${volumesDir}/${name}`, label: name });
  }

  volumes.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  return [bootVolume ?? { ...BOOT_VOLUME }, ...volumes];
}
