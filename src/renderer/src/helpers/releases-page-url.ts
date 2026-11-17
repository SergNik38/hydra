const UPSTREAM_RELEASES_PAGE_URL =
  "https://github.com/hydralauncher/hydra/releases/latest";
const MAC_RELEASES_PAGE_URL =
  "https://github.com/SergNik38/hydra/releases/latest";

// macOS builds are published by this fork because upstream ships no mac app.
export const getReleasesPageUrl = (platform: string) =>
  platform === "darwin" ? MAC_RELEASES_PAGE_URL : UPSTREAM_RELEASES_PAGE_URL;
