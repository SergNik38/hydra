import fs from "node:fs";
import path from "node:path";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export const buildWeblocContent = (url: string): string =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>URL</key>",
    `\t<string>${escapeXml(url)}</string>`,
    "</dict>",
    "</plist>",
    "",
  ].join("\n");

// Removes the symlink the old shortcuts code left next to the .webloc, but
// only if it points at Hydra so the user's own links are left alone.
const removeLegacySymlink = (
  legacyPath: string,
  outputDir: string,
  executablePath: string
): boolean => {
  try {
    if (!fs.lstatSync(legacyPath).isSymbolicLink()) {
      return true;
    }

    const linkTarget = path.resolve(outputDir, fs.readlinkSync(legacyPath));

    if (linkTarget === path.resolve(executablePath)) {
      fs.unlinkSync(legacyPath);
    }

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
};

export const createDarwinUrlShortcut = ({
  outputDir,
  name,
  url,
  legacySymlinkTarget,
}: {
  outputDir: string;
  name: string;
  url: string;
  legacySymlinkTarget: string;
}): boolean => {
  try {
    fs.mkdirSync(outputDir, { recursive: true });

    if (
      !removeLegacySymlink(
        path.join(outputDir, name),
        outputDir,
        legacySymlinkTarget
      )
    ) {
      return false;
    }

    fs.writeFileSync(
      path.join(outputDir, `${name}.webloc`),
      buildWeblocContent(url),
      "utf8"
    );

    return true;
  } catch {
    return false;
  }
};
