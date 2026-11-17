type UpdateFeed = {
  provider: "github";
  owner: string;
  repo: string;
};

const UPSTREAM_FEED: UpdateFeed = {
  provider: "github",
  owner: "hydralauncher",
  repo: "hydra",
};

const MAC_FEED: UpdateFeed = {
  provider: "github",
  owner: "SergNik38",
  repo: "hydra",
};

// macOS builds are published by this fork because upstream ships no mac app.
// Keeps the runtime feed in sync with the `mac.publish` block of
// electron-builder.yml, which is what writes app-update.yml.
export const getUpdateFeed = (platform: string): UpdateFeed =>
  platform === "darwin" ? MAC_FEED : UPSTREAM_FEED;
