import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import {
  isCloudSaveWindowsCompatibilityHost,
  isWindowsCompatibilityHost,
} from "./windows-compatibility-host.ts";

describe("windows compatibility host", () => {
  it("treats Linux and macOS as Wine hosts", () => {
    assert.equal(isWindowsCompatibilityHost("linux"), true);
    assert.equal(isWindowsCompatibilityHost("darwin"), true);
  });

  it("does not treat Windows as a Wine host", () => {
    assert.equal(isWindowsCompatibilityHost("win32"), false);
  });

  it("maps cloud-save path platforms onto the host platform", () => {
    assert.equal(isCloudSaveWindowsCompatibilityHost("linux"), true);
    assert.equal(isCloudSaveWindowsCompatibilityHost("mac"), true);
    assert.equal(isCloudSaveWindowsCompatibilityHost("windows"), false);
  });
});
