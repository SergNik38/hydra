const path = require("node:path");

const root = path.resolve(__dirname, "..");
const SUPPORTED_ARCHS = ["x64", "arm64"];

// Only macOS can build the native pieces for a foreign architecture (the
// release cut runs on Intel but also ships an Apple Silicon DMG); every other
// platform keeps building for its host so its output is unchanged.
function getNativeTargetArch() {
  const requested = process.env.HYDRA_NATIVE_ARCH;
  if (process.platform !== "darwin" || !requested) return process.arch;

  if (!SUPPORTED_ARCHS.includes(requested)) {
    throw new Error(
      `Unsupported HYDRA_NATIVE_ARCH "${requested}" (expected x64 or arm64)`
    );
  }
  return requested;
}

// Per-arch staging folder electron-builder packages for macOS.
function getNativeStageDir(arch = getNativeTargetArch()) {
  return path.join(root, "build", "native", `darwin-${arch}`);
}

// The dev app loads the host-arch files from ./hydra-native, so a cross build
// writes its files to the staging folder instead of overwriting them.
function getNativeOutputDir() {
  const arch = getNativeTargetArch();
  if (process.platform !== "darwin" || arch === process.arch)
    return path.join(root, "hydra-native");
  return getNativeStageDir(arch);
}

module.exports = { getNativeTargetArch, getNativeStageDir, getNativeOutputDir };
