import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, it } from "node:test";

import {
  convertShortcutIcon,
  isShortcutIconSource,
  parseSipsDimensions,
  pickShortcutIconSize,
  type SipsRunner,
} from "./darwin-shortcut-icon.ts";

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "hydra-shortcut-icon-test-")
  );
  tempDirs.push(dir);
  return dir;
};

after(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const outPathOf = (args: string[]) => args[args.indexOf("--out") + 1];

const makeFakeSips = ({
  width,
  height,
  icnsContent = "icns",
}: {
  width: number;
  height: number;
  icnsContent?: string;
}) => {
  const calls: string[][] = [];

  const run: SipsRunner = (args) => {
    calls.push(args);

    if (args[0] === "-g") {
      return `${args.at(-1)}\n  pixelWidth: ${width}\n  pixelHeight: ${height}\n`;
    }

    const out = outPathOf(args);

    if (args[0] === "-s") {
      fs.writeFileSync(out, args[2] === "icns" ? icnsContent : "png");
    } else {
      fs.writeFileSync(out, "resized");
    }

    return "";
  };

  return { calls, run };
};

describe("isShortcutIconSource", () => {
  it("accepts .png and .ico in any case", () => {
    assert.equal(isShortcutIconSource("/a/icon.png"), true);
    assert.equal(isShortcutIconSource("/a/icon.ico"), true);
    assert.equal(isShortcutIconSource("/a/ICON.ICO"), true);
    assert.equal(isShortcutIconSource("/a/Icon.Png"), true);
  });

  it("rejects other extensions", () => {
    assert.equal(isShortcutIconSource("/a/icon.jpg"), false);
    assert.equal(isShortcutIconSource("/a/icon.jpeg"), false);
    assert.equal(isShortcutIconSource("/a/icon"), false);
  });
});

describe("pickShortcutIconSize", () => {
  it("rounds up to the smallest standard square size", () => {
    assert.equal(pickShortcutIconSize(64, 64), 128);
    assert.equal(pickShortcutIconSize(128, 128), 128);
    assert.equal(pickShortcutIconSize(300, 300), 512);
    assert.equal(pickShortcutIconSize(16, 16), 16);
    assert.equal(pickShortcutIconSize(32, 32), 32);
    assert.equal(pickShortcutIconSize(256, 256), 256);
  });

  it("uses the longer side and caps at 512", () => {
    assert.equal(pickShortcutIconSize(2000, 1500), 512);
    assert.equal(pickShortcutIconSize(64, 300), 512);
    assert.equal(pickShortcutIconSize(512, 64), 512);
  });
});

describe("parseSipsDimensions", () => {
  it("reads the size from sips output", () => {
    assert.deepEqual(
      parseSipsDimensions(
        "/tmp/icon.png\n  pixelWidth: 64\n  pixelHeight: 48\n"
      ),
      { width: 64, height: 48 }
    );
  });

  it("returns null when sips printed no size", () => {
    assert.equal(parseSipsDimensions(""), null);
    assert.equal(parseSipsDimensions("pixelWidth: 64"), null);
  });
});

describe("convertShortcutIcon", () => {
  it("converts through png, resizes and writes the icns", () => {
    const dir = makeTempDir();
    const source = path.join(dir, "icon.ico");
    const icns = path.join(dir, "icon.icns");
    fs.writeFileSync(source, "ico");
    const { calls, run } = makeFakeSips({ width: 64, height: 64 });

    assert.equal(
      convertShortcutIcon({ sourcePath: source, icnsPath: icns, run }),
      true
    );

    assert.equal(fs.readFileSync(icns, "utf8"), "icns");

    const pngCall = calls[0];
    assert.deepEqual(pngCall.slice(0, 4), ["-s", "format", "png", source]);
    assert.ok(outPathOf(pngCall).endsWith(".png"));

    const sizeCall = calls[1];
    assert.equal(sizeCall[0], "-g");
    assert.equal(sizeCall.at(-1), outPathOf(pngCall));

    // 64x64 needs the standard 128 square for a valid .icns.
    assert.deepEqual(calls[2].slice(0, 3), ["-z", "128", "128"]);
    assert.equal(calls[3].slice(0, 3).join(" "), "-s format icns");
    assert.equal(outPathOf(calls[3]), icns);
  });

  it("picks the size from the larger side", () => {
    const dir = makeTempDir();
    const source = path.join(dir, "icon.png");
    const icns = path.join(dir, "icon.icns");
    fs.writeFileSync(source, "png");
    const { calls, run } = makeFakeSips({ width: 300, height: 64 });

    convertShortcutIcon({ sourcePath: source, icnsPath: icns, run });

    assert.deepEqual(calls[2].slice(0, 3), ["-z", "512", "512"]);
  });

  it("keeps temp files out of the destination and cleans them up", () => {
    const dir = makeTempDir();
    const outputDir = path.join(dir, "output");
    fs.mkdirSync(outputDir);
    const source = path.join(dir, "icon.ico");
    const icns = path.join(outputDir, "icon.icns");
    fs.writeFileSync(source, "ico");
    const { calls, run } = makeFakeSips({ width: 64, height: 64 });

    convertShortcutIcon({ sourcePath: source, icnsPath: icns, run });

    const tempPng = outPathOf(calls[0]);
    const tempDir = path.dirname(tempPng);

    assert.equal(path.dirname(tempDir), os.tmpdir());
    assert.equal(fs.existsSync(tempDir), false);
    assert.deepEqual(fs.readdirSync(outputDir), ["icon.icns"]);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["icon.ico", "output"]);
  });

  it("returns false and cleans up when sips fails", () => {
    const dir = makeTempDir();
    const source = path.join(dir, "icon.ico");
    const icns = path.join(dir, "icon.icns");
    fs.writeFileSync(source, "ico");
    let tempDir: string | null = null;

    const run: SipsRunner = (args) => {
      if (args[0] === "-g") {
        return "pixelWidth: 64\npixelHeight: 64\n";
      }

      const out = outPathOf(args);

      if (args[0] === "-s") {
        fs.writeFileSync(out, "png");
        tempDir = path.dirname(out);
      }

      if (args[0] === "-z") {
        throw new Error("sips failed");
      }

      return "";
    };

    assert.equal(
      convertShortcutIcon({ sourcePath: source, icnsPath: icns, run }),
      false
    );
    assert.equal(fs.existsSync(icns), false);
    assert.ok(tempDir);
    assert.equal(fs.existsSync(tempDir), false);
  });

  it("returns false when the icns comes out empty", () => {
    const dir = makeTempDir();
    const source = path.join(dir, "icon.png");
    const icns = path.join(dir, "icon.icns");
    fs.writeFileSync(source, "png");
    const { run } = makeFakeSips({ width: 128, height: 128, icnsContent: "" });

    assert.equal(
      convertShortcutIcon({ sourcePath: source, icnsPath: icns, run }),
      false
    );
  });

  it("returns false when the size cannot be read", () => {
    const dir = makeTempDir();
    const source = path.join(dir, "icon.png");
    const icns = path.join(dir, "icon.icns");
    fs.writeFileSync(source, "png");
    let tempDir: string | null = null;

    const run: SipsRunner = (args) => {
      if (args[0] === "-g") {
        return "";
      }

      const out = outPathOf(args);
      fs.writeFileSync(out, "png");
      tempDir = path.dirname(out);

      return "";
    };

    assert.equal(
      convertShortcutIcon({ sourcePath: source, icnsPath: icns, run }),
      false
    );
    assert.ok(tempDir);
    assert.equal(fs.existsSync(tempDir), false);
  });
});
