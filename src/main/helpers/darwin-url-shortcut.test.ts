import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  buildWeblocContent,
  createDarwinUrlShortcut,
} from "./darwin-url-shortcut.ts";

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-webloc-"));
  tempDirs.push(dir);
  return dir;
};

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("buildWeblocContent", () => {
  it("builds a plist with an escaped URL", () => {
    const url = "hydralauncher://run?shop=steam&objectId=10&name=A 'B' <C>";

    const content = buildWeblocContent(url);

    assert.match(content, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(content, /<plist version="1\.0">/);
    assert.match(content, /<key>URL<\/key>/);
    assert.ok(
      content.includes(
        "<string>hydralauncher://run?shop=steam&amp;objectId=10&amp;name=A &apos;B&apos; &lt;C&gt;</string>"
      )
    );
    assert.ok(!content.includes("shop=steam&objectId"));
  });

  it("escapes quotes", () => {
    const content = buildWeblocContent('https://example.com/?q="x"');

    assert.ok(content.includes("&quot;x&quot;"));
  });
});

describe("createDarwinUrlShortcut", () => {
  const url = "hydralauncher://run?shop=steam&objectId=10";
  const executablePath = "/Applications/Hydra.app/Contents/MacOS/Hydra";

  it("creates the .webloc file", () => {
    const dir = makeTempDir();

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    const shortcutPath = path.join(dir, "Game.webloc");
    assert.equal(
      fs.readFileSync(shortcutPath, "utf8"),
      buildWeblocContent(url)
    );
  });

  it("creates the output directory", () => {
    const dir = path.join(makeTempDir(), "nested", "desktop");

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );
    assert.ok(fs.existsSync(path.join(dir, "Game.webloc")));
  });

  it("removes the legacy symlink pointing at the given executable", () => {
    const dir = makeTempDir();
    const legacyPath = path.join(dir, "Game");
    fs.symlinkSync(executablePath, legacyPath);

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.equal(fs.existsSync(legacyPath), false);
    assert.ok(fs.existsSync(path.join(dir, "Game.webloc")));
  });

  it("resolves a relative legacy symlink target against the output directory", () => {
    const dir = makeTempDir();
    const legacyPath = path.join(dir, "Game");
    const relativeExecutable = path.join(dir, "Hydra");
    fs.writeFileSync(relativeExecutable, "");
    fs.symlinkSync("Hydra", legacyPath);

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: relativeExecutable,
      }),
      true
    );

    assert.equal(fs.existsSync(legacyPath), false);
  });

  it("keeps a symlink pointing somewhere else", () => {
    const dir = makeTempDir();
    const legacyPath = path.join(dir, "Game");
    fs.symlinkSync("/Applications/Other.app", legacyPath);

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.equal(fs.readlinkSync(legacyPath), "/Applications/Other.app");
    assert.ok(fs.existsSync(path.join(dir, "Game.webloc")));
  });

  it("keeps a regular file with the bare name", () => {
    const dir = makeTempDir();
    const regularPath = path.join(dir, "Game");
    fs.writeFileSync(regularPath, "keep me");

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.equal(fs.readFileSync(regularPath, "utf8"), "keep me");
  });

  it("overwrites an existing .webloc", () => {
    const dir = makeTempDir();
    const shortcutPath = path.join(dir, "Game.webloc");
    fs.writeFileSync(shortcutPath, "old content");

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.equal(
      fs.readFileSync(shortcutPath, "utf8"),
      buildWeblocContent(url)
    );
  });

  it("returns false when the shortcut cannot be written", () => {
    const dir = makeTempDir();
    const blockerPath = path.join(dir, "Game.webloc");
    fs.mkdirSync(blockerPath);

    assert.equal(
      createDarwinUrlShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      false
    );
  });
});
