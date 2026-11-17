import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  buildShortcutBundleId,
  buildShortcutInfoPlist,
  buildShortcutLauncherScript,
  isHydraShortcutInfoPlist,
} from "./darwin-app-shortcut-content.ts";
import { createDarwinAppShortcut } from "./darwin-url-shortcut.ts";

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-shortcut-"));
  tempDirs.push(dir);
  return dir;
};

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const executablePath = "/Applications/Hydra.app/Contents/MacOS/Hydra";
const url = "hydralauncher://run?shop=steam&objectId=10";

const readPlist = (dir: string, name = "Game") =>
  fs.readFileSync(
    path.join(dir, `${name}.app`, "Contents", "Info.plist"),
    "utf8"
  );

const writeFakeHydraApp = (dir: string, name = "Game") => {
  const contentsDir = path.join(dir, `${name}.app`, "Contents");
  fs.mkdirSync(contentsDir, { recursive: true });
  fs.writeFileSync(
    path.join(contentsDir, "Info.plist"),
    buildShortcutInfoPlist({
      name,
      bundleId: "gg.hydralauncher.shortcut.old",
      hasIcon: false,
    })
  );
};

describe("buildShortcutLauncherScript", () => {
  it("quotes the URL for the shell", () => {
    assert.equal(
      buildShortcutLauncherScript("hydralauncher://run?shop=steam&objectId=1"),
      "#!/bin/sh\nexec /usr/bin/open 'hydralauncher://run?shop=steam&objectId=1'\n"
    );
  });

  it("escapes single quotes in the URL", () => {
    assert.equal(
      buildShortcutLauncherScript("hydralauncher://run?name=Tom's&a=1"),
      "#!/bin/sh\nexec /usr/bin/open 'hydralauncher://run?name=Tom'\\''s&a=1'\n"
    );
  });
});

describe("buildShortcutInfoPlist", () => {
  it("describes the bundle without an icon", () => {
    const plist = buildShortcutInfoPlist({
      name: "Game & <Co>",
      bundleId: "gg.hydralauncher.shortcut.game---co-",
      hasIcon: false,
    });

    assert.match(plist, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(plist, /<plist version="1\.0">/);
    assert.ok(
      plist.includes("<key>CFBundleExecutable</key>\n\t<string>launch</string>")
    );
    assert.ok(
      plist.includes(
        "<key>CFBundleIdentifier</key>\n\t<string>gg.hydralauncher.shortcut.game---co-</string>"
      )
    );
    assert.ok(
      plist.includes(
        "<key>CFBundleName</key>\n\t<string>Game &amp; &lt;Co&gt;</string>"
      )
    );
    assert.ok(
      plist.includes("<key>CFBundlePackageType</key>\n\t<string>APPL</string>")
    );
    assert.ok(plist.includes("<key>HydraLauncherShortcut</key>\n\t<true/>"));
    assert.ok(plist.includes("<key>LSUIElement</key>\n\t<true/>"));
    assert.ok(!plist.includes("CFBundleIconFile"));
  });

  it("adds the icon key when an icon was written", () => {
    const plist = buildShortcutInfoPlist({
      name: "Game",
      bundleId: "gg.hydralauncher.shortcut.game",
      hasIcon: true,
    });

    assert.ok(
      plist.includes("<key>CFBundleIconFile</key>\n\t<string>icon</string>")
    );
  });
});

describe("buildShortcutBundleId", () => {
  it("slugs the name into the reverse-DNS id", () => {
    assert.equal(
      buildShortcutBundleId("My Game 2!"),
      "gg.hydralauncher.shortcut.my-game-2-"
    );
  });
});

describe("isHydraShortcutInfoPlist", () => {
  it("recognises the plist we write", () => {
    assert.equal(
      isHydraShortcutInfoPlist(
        buildShortcutInfoPlist({
          name: "Game",
          bundleId: "gg.hydralauncher.shortcut.game",
          hasIcon: false,
        })
      ),
      true
    );
  });

  it("rejects the marker set to false or another app's plist", () => {
    assert.equal(
      isHydraShortcutInfoPlist("<key>HydraLauncherShortcut</key>\n\t<false/>"),
      false
    );
    assert.equal(
      isHydraShortcutInfoPlist(
        buildShortcutInfoPlist({
          name: "Game",
          bundleId: "com.example.game",
          hasIcon: false,
        }).replace("<key>HydraLauncherShortcut</key>\n\t<true/>\n", "")
      ),
      false
    );
  });
});

describe("createDarwinAppShortcut", () => {
  it("creates an app bundle with an executable launcher", () => {
    const dir = makeTempDir();

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    const appPath = path.join(dir, "Game.app");
    const launcherPath = path.join(appPath, "Contents", "MacOS", "launch");

    assert.ok(fs.statSync(appPath).isDirectory());
    assert.equal(
      fs.readFileSync(launcherPath, "utf8"),
      buildShortcutLauncherScript(url)
    );
    assert.ok(fs.statSync(launcherPath).mode & 0o111);

    const plist = readPlist(dir);
    assert.ok(plist.includes("<key>HydraLauncherShortcut</key>"));
    assert.ok(
      plist.includes(
        "<key>CFBundleIdentifier</key>\n\t<string>gg.hydralauncher.shortcut.game</string>"
      )
    );
  });

  it("slugs the bundle id from the name", () => {
    const dir = makeTempDir();

    createDarwinAppShortcut({
      outputDir: dir,
      name: "My Game 2!",
      url,
      legacySymlinkTarget: executablePath,
    });

    assert.ok(
      readPlist(dir, "My Game 2!").includes(
        "<key>CFBundleIdentifier</key>\n\t<string>gg.hydralauncher.shortcut.my-game-2-</string>"
      )
    );
  });

  it("creates the output directory", () => {
    const dir = path.join(makeTempDir(), "nested", "desktop");

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.ok(
      fs.existsSync(path.join(dir, "Game.app", "Contents", "Info.plist"))
    );
  });

  it("leaves no temp bundle behind", () => {
    const dir = makeTempDir();

    createDarwinAppShortcut({
      outputDir: dir,
      name: "Game",
      url,
      legacySymlinkTarget: executablePath,
    });

    assert.deepEqual(fs.readdirSync(dir), ["Game.app"]);
  });

  it("replaces an existing Hydra shortcut", () => {
    const dir = makeTempDir();
    writeFakeHydraApp(dir);
    fs.writeFileSync(path.join(dir, "Game.app", "Contents", "stale"), "old");

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.ok(!fs.existsSync(path.join(dir, "Game.app", "Contents", "stale")));
    assert.ok(readPlist(dir).includes("<key>HydraLauncherShortcut</key>"));
  });

  it("keeps an app it did not create", () => {
    const dir = makeTempDir();
    const contentsDir = path.join(dir, "Game.app", "Contents");
    fs.mkdirSync(contentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(contentsDir, "Info.plist"),
      buildShortcutInfoPlist({
        name: "Game",
        bundleId: "com.example.game",
        hasIcon: false,
      }).replace("<key>HydraLauncherShortcut</key>\n\t<true/>\n", "")
    );

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      false
    );

    assert.ok(
      fs
        .readFileSync(path.join(contentsDir, "Info.plist"), "utf8")
        .includes("com.example.game")
    );
    assert.deepEqual(fs.readdirSync(dir), ["Game.app"]);
  });

  it("keeps an app whose marker is not true", () => {
    const dir = makeTempDir();
    const contentsDir = path.join(dir, "Game.app", "Contents");
    fs.mkdirSync(contentsDir, { recursive: true });
    fs.writeFileSync(
      path.join(contentsDir, "Info.plist"),
      buildShortcutInfoPlist({
        name: "Game",
        bundleId: "com.example.game",
        hasIcon: false,
      }).replace(
        "<key>HydraLauncherShortcut</key>\n\t<true/>",
        "<key>HydraLauncherShortcut</key>\n\t<false/>"
      )
    );

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      false
    );

    assert.ok(
      fs
        .readFileSync(path.join(contentsDir, "Info.plist"), "utf8")
        .includes("com.example.game")
    );
    assert.deepEqual(fs.readdirSync(dir), ["Game.app"]);
  });

  it("keeps the old shortcut when the new bundle cannot be built", () => {
    const dir = makeTempDir();
    writeFakeHydraApp(dir);
    fs.chmodSync(dir, 0o555);

    try {
      assert.equal(
        createDarwinAppShortcut({
          outputDir: dir,
          name: "Game",
          url,
          legacySymlinkTarget: executablePath,
        }),
        false
      );
    } finally {
      fs.chmodSync(dir, 0o755);
    }

    assert.ok(readPlist(dir).includes("gg.hydralauncher.shortcut.old"));
    assert.deepEqual(fs.readdirSync(dir), ["Game.app"]);
  });

  it("puts the old shortcut back when the swap fails", () => {
    const dir = makeTempDir();
    writeFakeHydraApp(dir);
    fs.writeFileSync(path.join(dir, "Game.app", "Contents", "old"), "old");

    // Fail only the rename of the freshly built temp bundle into place.
    const renameFile = (from: string, to: string) => {
      if (path.basename(from).startsWith("Game.app.tmp-")) {
        throw new Error("swap failed");
      }

      fs.renameSync(from, to);
    };

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
        renameFile,
      }),
      false
    );

    assert.deepEqual(fs.readdirSync(dir), ["Game.app"]);
    assert.equal(
      fs.readFileSync(path.join(dir, "Game.app", "Contents", "old"), "utf8"),
      "old"
    );
    assert.ok(readPlist(dir).includes("gg.hydralauncher.shortcut.old"));
  });

  it("removes the legacy symlink pointing at the given executable", () => {
    const dir = makeTempDir();
    const legacyPath = path.join(dir, "Game");
    fs.symlinkSync(executablePath, legacyPath);

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.equal(fs.existsSync(legacyPath), false);
    assert.ok(fs.existsSync(path.join(dir, "Game.app")));
  });

  it("resolves a relative legacy symlink target against the output directory", () => {
    const dir = makeTempDir();
    const legacyPath = path.join(dir, "Game");
    const relativeExecutable = path.join(dir, "Hydra");
    fs.writeFileSync(relativeExecutable, "");
    fs.symlinkSync("Hydra", legacyPath);

    assert.equal(
      createDarwinAppShortcut({
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
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.equal(fs.readlinkSync(legacyPath), "/Applications/Other.app");
    assert.ok(fs.existsSync(path.join(dir, "Game.app")));
  });

  it("keeps a regular file with the bare name", () => {
    const dir = makeTempDir();
    const regularPath = path.join(dir, "Game");
    fs.writeFileSync(regularPath, "keep me");

    createDarwinAppShortcut({
      outputDir: dir,
      name: "Game",
      url,
      legacySymlinkTarget: executablePath,
    });

    assert.equal(fs.readFileSync(regularPath, "utf8"), "keep me");
  });

  it("removes the legacy .webloc with a Hydra link", () => {
    const dir = makeTempDir();
    const weblocPath = path.join(dir, "Game.webloc");
    fs.writeFileSync(weblocPath, `<string>${url}&amp;</string>`);

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
      }),
      true
    );

    assert.equal(fs.existsSync(weblocPath), false);
  });

  it("keeps a .webloc without a Hydra link", () => {
    const dir = makeTempDir();
    const weblocPath = path.join(dir, "Game.webloc");
    fs.writeFileSync(weblocPath, "https://example.com");

    createDarwinAppShortcut({
      outputDir: dir,
      name: "Game",
      url,
      legacySymlinkTarget: executablePath,
    });

    assert.equal(fs.readFileSync(weblocPath, "utf8"), "https://example.com");
  });

  it("writes the icon when the converter succeeds", () => {
    const dir = makeTempDir();
    const png = path.join(dir, "icon.png");
    fs.writeFileSync(png, "png");
    const calls: [string, string][] = [];

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
        iconPath: png,
        convertIcon: (pngPath, icnsPath) => {
          calls.push([pngPath, icnsPath]);
          fs.writeFileSync(icnsPath, "icns");
          return true;
        },
      }),
      true
    );

    const icnsPath = path.join(
      dir,
      "Game.app",
      "Contents",
      "Resources",
      "icon.icns"
    );
    // The bundle is built in a temp directory first, so only the suffix is known.
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0], png);
    assert.ok(calls[0][1].startsWith(dir));
    assert.ok(
      calls[0][1].endsWith(path.join("Contents", "Resources", "icon.icns"))
    );
    assert.equal(fs.readFileSync(icnsPath, "utf8"), "icns");
    assert.ok(readPlist(dir).includes("<key>CFBundleIconFile</key>"));
  });

  it("passes an .ico source to the converter", () => {
    const dir = makeTempDir();
    const ico = path.join(dir, "icon.ICO");
    fs.writeFileSync(ico, "ico");
    const calls: string[] = [];

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
        iconPath: ico,
        convertIcon: (iconPath, icnsPath) => {
          calls.push(iconPath);
          fs.writeFileSync(icnsPath, "icns");
          return true;
        },
      }),
      true
    );

    assert.deepEqual(calls, [ico]);
    assert.ok(
      fs.existsSync(
        path.join(dir, "Game.app", "Contents", "Resources", "icon.icns")
      )
    );
    assert.ok(readPlist(dir).includes("<key>CFBundleIconFile</key>"));
  });

  it("skips the icon for non-png/non-ico sources", () => {
    const dir = makeTempDir();
    const jpg = path.join(dir, "icon.jpg");
    fs.writeFileSync(jpg, "jpg");
    let convertCalls = 0;

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
        iconPath: jpg,
        convertIcon: () => {
          convertCalls += 1;
          return true;
        },
      }),
      true
    );

    assert.equal(convertCalls, 0);
    assert.ok(
      !fs.existsSync(
        path.join(dir, "Game.app", "Contents", "Resources", "icon.icns")
      )
    );
    assert.ok(!readPlist(dir).includes("CFBundleIconFile"));
  });

  it("skips the icon when the converter fails", () => {
    const dir = makeTempDir();
    const png = path.join(dir, "icon.png");
    fs.writeFileSync(png, "png");

    assert.equal(
      createDarwinAppShortcut({
        outputDir: dir,
        name: "Game",
        url,
        legacySymlinkTarget: executablePath,
        iconPath: png,
        convertIcon: (_pngPath, icnsPath) => {
          // A converter may leave a partial file behind before failing.
          fs.writeFileSync(icnsPath, "");
          return false;
        },
      }),
      true
    );

    assert.ok(
      !fs.existsSync(
        path.join(dir, "Game.app", "Contents", "Resources", "icon.icns")
      )
    );
    assert.ok(!readPlist(dir).includes("CFBundleIconFile"));
  });
});
