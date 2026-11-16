import { readdir } from "node:fs/promises";
import path from "node:path";

const bundleExpansionCache = new Map<string, string[]>();

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, "");

const readDirEntries = (dir: string) => readdir(dir);

export async function expandDarwinExecutablePath(
  executablePath: string,
  listDir: (dir: string) => Promise<string[]> = readDirEntries
): Promise<string[]> {
  const bundlePath = stripTrailingSlashes(executablePath);

  if (!bundlePath.toLowerCase().endsWith(".app")) return [executablePath];

  const cacheKey = bundlePath.toLowerCase();
  const cached = bundleExpansionCache.get(cacheKey);
  if (cached) return cached;

  const binariesDir = path.join(bundlePath, "Contents", "MacOS");

  let entries: string[];
  try {
    entries = await listDir(binariesDir);
  } catch {
    return [];
  }

  const bundleName = path.basename(bundlePath).replace(/\.app$/i, "");

  const matchingEntry = entries.find(
    (entry) => entry.toLowerCase() === bundleName.toLowerCase()
  );

  const candidates = matchingEntry
    ? [matchingEntry]
    : entries.filter((entry) => !entry.startsWith("."));

  if (!candidates.length) return [];

  const binaries = candidates.map((entry) => path.join(binariesDir, entry));
  bundleExpansionCache.set(cacheKey, binaries);

  return binaries;
}

export function hasDarwinProcessMatch(
  candidates: string[],
  processMap: Map<string, Set<string>>
): boolean {
  return candidates.some((candidate) => {
    const processPaths = processMap.get(path.basename(candidate).toLowerCase());
    if (!processPaths) return false;

    // macOS filesystems are case-insensitive by default.
    const target = candidate.toLowerCase();
    for (const processPath of processPaths) {
      if (processPath.toLowerCase() === target) return true;
    }

    return false;
  });
}
