import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchesCatalogueExecutable } from "./process-catalogue-match.js";

const windowsEntry = { name: "bin\\game.exe", exe: "game.exe" };
const posixWindowsEntry = { name: "bin/game.exe", exe: "game.exe" };
const darwinEntry = {
  name: "nativegame.app/contents/macos/game",
  exe: "game",
};

describe("matchesCatalogueExecutable", () => {
  it("rejects Windows entries on macOS", () => {
    assert.equal(
      matchesCatalogueExecutable(
        "darwin",
        posixWindowsEntry,
        "/applications/foo.app/contents/macos/game"
      ),
      false
    );
  });

  it("matches native macOS entries on macOS", () => {
    assert.equal(
      matchesCatalogueExecutable(
        "darwin",
        darwinEntry,
        "/Applications/NativeGame.app/Contents/MacOS/game"
      ),
      true
    );
    assert.equal(
      matchesCatalogueExecutable(
        "darwin",
        darwinEntry,
        "/Applications/Other/Contents/MacOS/game"
      ),
      true
    );
  });

  it("keeps the stem fallback for Windows entries on Linux", () => {
    assert.equal(
      matchesCatalogueExecutable("linux", posixWindowsEntry, "/games/game"),
      true
    );
    assert.equal(
      matchesCatalogueExecutable(
        "linux",
        posixWindowsEntry,
        "/games/bin/game.exe"
      ),
      true
    );
  });

  it("keeps the Windows path matching unchanged", () => {
    assert.equal(
      matchesCatalogueExecutable(
        "win32",
        windowsEntry,
        "c:\\games\\bin\\game.exe"
      ),
      true
    );
    assert.equal(
      matchesCatalogueExecutable("win32", windowsEntry, "c:\\games\\game"),
      true
    );
    assert.equal(
      matchesCatalogueExecutable("win32", windowsEntry, "c:\\games\\other"),
      false
    );
  });
});
