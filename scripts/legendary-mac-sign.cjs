const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { sign } = require("app-builder-lib/out/codeSign/macCodeSign");

const execFileAsync = promisify(execFile);

function createSigningOptions(options, projectDir) {
  const legendaryPath = path.join(
    options.app,
    "Contents",
    "Resources",
    "legendary",
    "legendary"
  );
  return {
    ...options,
    optionsForFile(filePath) {
      const inherited = options.optionsForFile
        ? options.optionsForFile(filePath)
        : {};
      if (filePath !== legendaryPath) return inherited;
      // Scope the PyInstaller library-validation entitlement to this helper.
      // Keep Hydra, Electron, and every other native binary's options intact.
      return {
        ...inherited,
        entitlements: path.join(
          projectDir,
          "build",
          "entitlements.legendary.mac.plist"
        ),
      };
    },
  };
}

// macOS refuses to launch unsigned code on Apple Silicon, so fall back to an
// ad-hoc signature. Hardened runtime stays off for it: the runtime turns on
// library validation, which would refuse our own native addon and torrent
// bridge, since an ad-hoc app has no Team ID to match them against.
async function adhocSign(appPath) {
  console.log("Signing the macOS app ad-hoc (no Developer ID identity).");
  await execFileAsync("/usr/bin/codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    appPath,
  ]);
}

async function signMac(options, packager) {
  // A custom hook makes electron-builder call us even without a certificate.
  if (!options.identity) {
    if (packager.forceCodeSigning || options.platform === "mas") {
      throw new Error(
        "Cannot sign macOS application: no signing identity available."
      );
    }
    await adhocSign(options.app);
    return;
  }
  // Delegate to the same signer and retry policy electron-builder normally uses.
  await sign(createSigningOptions(options, packager.projectDir));
}

module.exports = signMac;
