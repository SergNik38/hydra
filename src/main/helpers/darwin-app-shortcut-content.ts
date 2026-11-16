// Pure string builders for the macOS shortcut app bundle. No filesystem access
// here, so this stays easy to test and the bundle layout lives in one place.

const MARKER_KEY = "HydraLauncherShortcut";
const BUNDLE_ID_PREFIX = "gg.hydralauncher.shortcut";
const ICON_RESOURCE_NAME = "icon";

export const SHORTCUT_EXECUTABLE_NAME = "launch";
export const SHORTCUT_ICON_FILE_NAME = "icon.icns";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const quoteForShell = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export const toShortcutBundleSlug = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, "-");

export const buildShortcutBundleId = (name: string) =>
  `${BUNDLE_ID_PREFIX}.${toShortcutBundleSlug(name)}`;

export const buildShortcutLauncherScript = (url: string): string =>
  `#!/bin/sh\nexec /usr/bin/open ${quoteForShell(url)}\n`;

export const buildShortcutInfoPlist = ({
  name,
  bundleId,
  hasIcon,
}: {
  name: string;
  bundleId: string;
  hasIcon: boolean;
}): string => {
  const entries: [string, string][] = [
    ["CFBundleExecutable", SHORTCUT_EXECUTABLE_NAME],
    ["CFBundleIdentifier", bundleId],
    ["CFBundleName", name],
    ["CFBundlePackageType", "APPL"],
  ];

  if (hasIcon) {
    entries.push(["CFBundleIconFile", ICON_RESOURCE_NAME]);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    ...entries.flatMap(([key, value]) => [
      `\t<key>${key}</key>`,
      `\t<string>${escapeXml(value)}</string>`,
    ]),
    `\t<key>${MARKER_KEY}</key>`,
    "\t<true/>",
    "\t<key>LSUIElement</key>",
    "\t<true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
};

const HYDRA_SHORTCUT_MARKER = new RegExp(
  `<key>${MARKER_KEY}</key>\\s*<true\\s*/>`
);

export const isHydraShortcutInfoPlist = (plist: string) =>
  HYDRA_SHORTCUT_MARKER.test(plist);
