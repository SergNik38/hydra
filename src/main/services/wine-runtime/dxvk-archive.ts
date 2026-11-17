import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

const TAR_MAX_BUFFER_BYTES = 16 * 1024 * 1024;
const MAX_SEARCH_DEPTH = 2;
const ARCHITECTURE_DIRECTORIES = ["x64", "x32"] as const;
const DXVK_DLLS = ["d3d11.dll", "d3d10core.dll"] as const;

const isFile = (filePath: string) => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

export const hasDxvkLayout = (directory: string) =>
  ARCHITECTURE_DIRECTORIES.every((architecture) =>
    DXVK_DLLS.every((dll) => isFile(path.join(directory, architecture, dll)))
  );

const findDxvkRoot = async (root: string): Promise<string | null> => {
  const queue: { directory: string; depth: number }[] = [
    { directory: root, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift() as { directory: string; depth: number };
    if (hasDxvkLayout(current.directory)) return current.directory;
    if (current.depth === MAX_SEARCH_DEPTH) continue;

    const entries = await fs.promises
      .readdir(current.directory, { withFileTypes: true })
      .catch(() => [] as fs.Dirent[]);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        queue.push({
          directory: path.join(current.directory, entry.name),
          depth: current.depth + 1,
        });
      }
    }
  }

  return null;
};

const extractArchive = (archivePath: string, destination: string) =>
  new Promise<void>((resolve, reject) => {
    execFile(
      "/usr/bin/tar",
      ["-xzf", archivePath, "-C", destination],
      { maxBuffer: TAR_MAX_BUFFER_BYTES },
      (error) => (error ? reject(error) : resolve())
    );
  });

export const installDxvkArchive = async ({
  archivePath,
  versionDir,
}: {
  archivePath: string;
  versionDir: string;
}): Promise<void> => {
  const temporaryDirectory = path.join(
    path.dirname(versionDir),
    `.extract-${randomUUID()}`
  );
  await fs.promises.mkdir(temporaryDirectory, { recursive: true });

  try {
    await extractArchive(archivePath, temporaryDirectory);

    const dxvkRoot = await findDxvkRoot(temporaryDirectory);
    if (!dxvkRoot) {
      throw new Error("DXVK archive does not contain the expected DLL layout");
    }

    await fs.promises.rm(versionDir, { recursive: true, force: true });
    await fs.promises.rename(dxvkRoot, versionDir);
  } finally {
    await fs.promises
      .rm(temporaryDirectory, { recursive: true, force: true })
      .catch(() => undefined);
  }
};
