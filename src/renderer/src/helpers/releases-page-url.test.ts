import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getReleasesPageUrl } from "./releases-page-url.js";

const UPSTREAM_RELEASES_PAGE_URL =
  "https://github.com/hydralauncher/hydra/releases/latest";
const MAC_RELEASES_PAGE_URL =
  "https://github.com/SergNik38/hydra/releases/latest";

describe("getReleasesPageUrl", () => {
  it("points macOS at the fork releases", () => {
    assert.equal(getReleasesPageUrl("darwin"), MAC_RELEASES_PAGE_URL);
  });

  it("keeps upstream releases for Windows and Linux", () => {
    assert.equal(getReleasesPageUrl("win32"), UPSTREAM_RELEASES_PAGE_URL);
    assert.equal(getReleasesPageUrl("linux"), UPSTREAM_RELEASES_PAGE_URL);
  });
});
