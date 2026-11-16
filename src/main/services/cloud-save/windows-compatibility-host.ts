export const isWindowsCompatibilityHost = (platform: string) =>
  platform === "linux" || platform === "darwin";

// Cloud-save path contexts spell macOS as "mac", while the host check uses the
// OS platform names.
export const isCloudSaveWindowsCompatibilityHost = (platform: string) =>
  isWindowsCompatibilityHost(platform === "mac" ? "darwin" : platform);
