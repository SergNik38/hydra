export const supportsWinePrefix = (platform: string) =>
  platform === "linux" || platform === "darwin";

// Proton, Gamemode, MangoHud and winetricks only exist on Linux.
export const supportsLinuxCompatibilityTools = (platform: string) =>
  platform === "linux";
