import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  buildShortcutBundleId,
  buildShortcutInfoPlist,
  buildShortcutLauncherScript,
  isHydraShortcutInfoPlist,
  SHORTCUT_EXECUTABLE_NAME,
  SHORTCUT_ICON_FILE_NAME,
} from "./darwin-app-shortcut-content.js";
import {
  convertShortcutIcon,
  isShortcutIconSource,
} from "./darwin-shortcut-icon.js";

// Finder refuses to open .webloc files with a custom scheme (LaunchServices
// -10400), so a macOS shortcut is a tiny app bundle whose executable just
// hands the deep link back to Hydra via `open`.

const convertIconWithSips = (iconPath: string, icnsPath: string): boolean =>
  convertShortcutIcon({ sourcePath: iconPath, icnsPath });

const pathExists = (target: string) => {
  try {
    fs.lstatSync(target);
    return true;
  } catch {
    return false;
  }
};

const rmQuietly = (target: string) => {
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    // Best effort: a leftover backup beats a broken shortcut.
  }
};

const isHydraShortcutBundle = (appPath: string): boolean => {
  try {
    if (!fs.statSync(appPath).isDirectory()) {
      return false;
    }

    return isHydraShortcutInfoPlist(
      fs.readFileSync(path.join(appPath, "Contents", "Info.plist"), "utf8")
    );
  } catch {
    return false;
  }
};

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

// Same idea for the .webloc the previous version wrote: only drop it when it
// is ours, never a file the user put there.
const removeLegacyWebloc = (weblocPath: string) => {
  try {
    if (!fs.lstatSync(weblocPath).isFile()) {
      return;
    }

    if (fs.readFileSync(weblocPath, "utf8").includes("hydralauncher://")) {
      fs.unlinkSync(weblocPath);
    }
  } catch {
    return;
  }
};

const writeBundle = ({
  bundleDir,
  name,
  bundleId,
  url,
  iconPath,
  convertIcon,
}: {
  bundleDir: string;
  name: string;
  bundleId: string;
  url: string;
  iconPath?: string | null;
  convertIcon: (iconPath: string, icnsPath: string) => boolean;
}) => {
  const contentsDir = path.join(bundleDir, "Contents");
  const macOsDir = path.join(contentsDir, "MacOS");
  const resourcesDir = path.join(contentsDir, "Resources");

  fs.mkdirSync(macOsDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });

  let hasIcon = false;

  if (iconPath && isShortcutIconSource(iconPath)) {
    const icnsPath = path.join(resourcesDir, SHORTCUT_ICON_FILE_NAME);

    try {
      hasIcon = convertIcon(iconPath, icnsPath);
    } catch {
      hasIcon = false;
    }

    if (!hasIcon) {
      fs.rmSync(icnsPath, { force: true });
    }
  }

  fs.writeFileSync(
    path.join(contentsDir, "Info.plist"),
    buildShortcutInfoPlist({ name, bundleId, hasIcon }),
    "utf8"
  );

  const launcherPath = path.join(macOsDir, SHORTCUT_EXECUTABLE_NAME);
  fs.writeFileSync(launcherPath, buildShortcutLauncherScript(url), {
    encoding: "utf8",
    mode: 0o755,
  });
  fs.chmodSync(launcherPath, 0o755);
};

export const createDarwinAppShortcut = ({
  outputDir,
  name,
  url,
  legacySymlinkTarget,
  iconPath,
  convertIcon = convertIconWithSips,
  renameFile = fs.renameSync,
}: {
  outputDir: string;
  name: string;
  url: string;
  legacySymlinkTarget: string;
  iconPath?: string | null;
  convertIcon?: (iconPath: string, icnsPath: string) => boolean;
  /** Seam so the rollback after a failed swap can be tested. */
  renameFile?: (from: string, to: string) => void;
}): boolean => {
  const appPath = path.join(outputDir, `${name}.app`);

  let tempDir: string | null = null;
  let backupPath: string | null = null;

  try {
    fs.mkdirSync(outputDir, { recursive: true });

    if (pathExists(appPath) && !isHydraShortcutBundle(appPath)) {
      return false;
    }

    if (
      !removeLegacySymlink(
        path.join(outputDir, name),
        outputDir,
        legacySymlinkTarget
      )
    ) {
      return false;
    }

    removeLegacyWebloc(path.join(outputDir, `${name}.webloc`));

    // Build next to the destination, then swap, so a half-written bundle never
    // shows up in Finder and a failure leaves the old shortcut alone.
    tempDir = fs.mkdtempSync(path.join(outputDir, `${name}.app.tmp-`));
    fs.chmodSync(tempDir, 0o755);

    writeBundle({
      bundleDir: tempDir,
      name,
      bundleId: buildShortcutBundleId(name),
      url,
      iconPath,
      convertIcon,
    });

    if (pathExists(appPath)) {
      backupPath = path.join(outputDir, `${name}.app.old-${randomUUID()}`);
      renameFile(appPath, backupPath);
    }

    renameFile(tempDir, appPath);
    tempDir = null;
  } catch {
    if (backupPath) {
      try {
        renameFile(backupPath, appPath);
      } catch {
        // Keep the backup on disk rather than delete the user's old shortcut.
      }
    }

    if (tempDir) {
      rmQuietly(tempDir);
    }

    return false;
  }

  if (backupPath) {
    rmQuietly(backupPath);
  }

  return true;
};
