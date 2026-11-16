// Legacy (Ludusavi) cloud sync predates per-platform prefix handling: on macOS
// the effective prefix is the default per-game path even for native games, so
// only a Windows executable proves the game runs under Wine.
export const legacyCloudSyncPrefixPath = (
  platform: string,
  executablePath: string | null | undefined,
  effectivePrefixPath: string | null
) => {
  if (platform !== "darwin") return effectivePrefixPath;

  return executablePath?.toLowerCase().endsWith(".exe") === true
    ? effectivePrefixPath
    : null;
};
