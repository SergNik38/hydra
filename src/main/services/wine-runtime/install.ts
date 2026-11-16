import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";

const WINE_BINARY_NAMES = ["wine64", "wine"] as const;
const MAX_SEARCH_DEPTH = 6;
const TAR_MAX_BUFFER_BYTES = 16 * 1024 * 1024;

export interface InstallArchiveOptions {
  archivePath: string;
  versionDir: string;
}

export interface InstallArchiveResult {
  binaryRelativePath: string;
}

const isExecutableFile = async (filePath: string) => {
  const stat = await fs.promises.stat(filePath).catch(() => null);
  return Boolean(stat?.isFile() && (stat.mode & 0o111) !== 0);
};

export const findWineBinary = async (root: string): Promise<string | null> => {
  const queue: { directory: string; depth: number }[] = [
    { directory: root, depth: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift() as { directory: string; depth: number };
    const binDirectory = path.join(current.directory, "bin");

    for (const name of WINE_BINARY_NAMES) {
      const candidate = path.join(binDirectory, name);
      if (await isExecutableFile(candidate)) {
        return path.relative(root, candidate);
      }
    }

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
      ["-xJf", archivePath, "-C", destination],
      { maxBuffer: TAR_MAX_BUFFER_BYTES },
      (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      }
    );
  });

export const installArchive = async ({
  archivePath,
  versionDir,
}: InstallArchiveOptions): Promise<InstallArchiveResult> => {
  const temporaryDirectory = path.join(
    path.dirname(versionDir),
    `.extract-${randomUUID()}`
  );
  await fs.promises.mkdir(temporaryDirectory, { recursive: true });

  try {
    await extractArchive(archivePath, temporaryDirectory);

    const binaryRelativePath = await findWineBinary(temporaryDirectory);
    if (!binaryRelativePath) {
      throw new Error("Wine runtime archive does not contain a Wine binary");
    }

    await fs.promises.rm(versionDir, { recursive: true, force: true });
    await fs.promises.rename(temporaryDirectory, versionDir);

    return { binaryRelativePath };
  } finally {
    await fs.promises
      .rm(temporaryDirectory, { recursive: true, force: true })
      .catch(() => undefined);
  }
};
