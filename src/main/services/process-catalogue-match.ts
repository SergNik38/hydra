import type { KnownGameExecutable } from "@main/helpers/game-executable-ranking";

// macOS runs Windows games through the managed Wine, whose process is named
// "wine", and a native binary can share the stem of a Windows exe name, so a
// Windows catalogue entry can never identify a process there.
const isWindowsEntryOnDarwin = (
  platform: NodeJS.Platform,
  executable: KnownGameExecutable
) => platform === "darwin" && executable.exe.toLowerCase().endsWith(".exe");

export const matchesCatalogueExecutable = (
  platform: NodeJS.Platform,
  executable: KnownGameExecutable,
  processPath: string
): boolean => {
  if (isWindowsEntryOnDarwin(platform, executable)) return false;

  const path = processPath.toLowerCase();
  const name = executable.name.toLowerCase();
  const nameWithoutExtension = executable.exe
    .toLowerCase()
    .replace(/\.exe$/, "");

  return path.endsWith(name) || path.endsWith(nameWithoutExtension);
};
