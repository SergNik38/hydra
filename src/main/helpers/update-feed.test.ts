import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getUpdateFeed } from "./update-feed.js";

describe("getUpdateFeed", () => {
  it("reads macOS updates from the fork", () => {
    assert.deepEqual(getUpdateFeed("darwin"), {
      provider: "github",
      owner: "SergNik38",
      repo: "hydra",
    });
  });

  it("keeps upstream releases for Windows and Linux", () => {
    assert.deepEqual(getUpdateFeed("win32"), {
      provider: "github",
      owner: "hydralauncher",
      repo: "hydra",
    });
    assert.deepEqual(getUpdateFeed("linux"), {
      provider: "github",
      owner: "hydralauncher",
      repo: "hydra",
    });
  });
});
