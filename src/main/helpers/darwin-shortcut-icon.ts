import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// `sips` refuses to write .icns straight from .ico and only accepts square
// images at standard icon sizes, so the icon goes through a PNG + resize step.
// Hydra downloads Steam icons as .ico, hence the second source extension.

const ICON_SOURCE_EXTENSIONS = [".png", ".ico"];
const STANDARD_ICON_SIZES = [16, 32, 128, 256, 512];
const MAX_ICON_SIZE = STANDARD_ICON_SIZES[STANDARD_ICON_SIZES.length - 1];
const SIPS_PATH = "/usr/bin/sips";

/** Runs `sips` with an argument array and returns its stdout. */
export type SipsRunner = (args: string[]) => string;

const runSips: SipsRunner = (args) =>
  execFileSync(SIPS_PATH, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });

const rmQuietly = (target: string) => {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Best effort: a leftover temp file must not fail the shortcut.
  }
};

export const isShortcutIconSource = (sourcePath: string) =>
  ICON_SOURCE_EXTENSIONS.includes(path.extname(sourcePath).toLowerCase());

export const pickShortcutIconSize = (width: number, height: number): number => {
  const longestSide = Math.max(width, height);

  return (
    STANDARD_ICON_SIZES.find((size) => size >= longestSide) ?? MAX_ICON_SIZE
  );
};

export const parseSipsDimensions = (
  output: string
): { width: number; height: number } | null => {
  const width = /pixelWidth:\s*(\d+)/.exec(output)?.[1];
  const height = /pixelHeight:\s*(\d+)/.exec(output)?.[1];

  if (!width || !height) {
    return null;
  }

  return { width: Number(width), height: Number(height) };
};

export const convertShortcutIcon = ({
  sourcePath,
  icnsPath,
  run = runSips,
}: {
  sourcePath: string;
  icnsPath: string;
  run?: SipsRunner;
}): boolean => {
  let tempDir: string | null = null;

  try {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-shortcut-icon-"));
    const pngPath = path.join(tempDir, "icon.png");

    // Also for .png sources: it normalises the file the rest of the pipeline reads.
    run(["-s", "format", "png", sourcePath, "--out", pngPath]);

    const dimensions = parseSipsDimensions(
      run(["-g", "pixelWidth", "-g", "pixelHeight", pngPath])
    );

    if (!dimensions) {
      return false;
    }

    const size = pickShortcutIconSize(dimensions.width, dimensions.height);
    const resizedPath = path.join(tempDir, `icon-${size}.png`);

    run(["-z", String(size), String(size), pngPath, "--out", resizedPath]);
    run(["-s", "format", "icns", resizedPath, "--out", icnsPath]);

    return fs.statSync(icnsPath).size > 0;
  } catch {
    return false;
  } finally {
    if (tempDir) {
      rmQuietly(tempDir);
    }
  }
};
