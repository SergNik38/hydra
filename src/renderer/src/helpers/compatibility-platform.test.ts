import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  supportsLinuxCompatibilityTools,
  supportsWinePrefix,
} from "./compatibility-platform.js";

describe("supportsWinePrefix", () => {
  it("is supported on Linux and macOS only", () => {
    assert.equal(supportsWinePrefix("linux"), true);
    assert.equal(supportsWinePrefix("darwin"), true);
    assert.equal(supportsWinePrefix("win32"), false);
  });
});

describe("supportsLinuxCompatibilityTools", () => {
  it("is supported on Linux only", () => {
    assert.equal(supportsLinuxCompatibilityTools("linux"), true);
    assert.equal(supportsLinuxCompatibilityTools("darwin"), false);
    assert.equal(supportsLinuxCompatibilityTools("win32"), false);
  });
});
