const fs = require("node:fs");
const path = require("node:path");
const { getNativeStageDir } = require("./native-target-arch.cjs");

const root = path.resolve(__dirname, "..");
// build-torrent-bridge.cjs always writes here, whatever the target arch.
const bridgeOutputDir = path.join(root, "hydra-native");
const crossTestEmulator = path.join(__dirname, "skip-foreign-arch-test.sh");

function restoreEnv(name, previous) {
  if (previous === undefined) delete process.env[name];
  else process.env[name] = previous;
}

// build-torrent-bridge.cjs keeps deriving the vcpkg triplet from process.arch
// and always stages into ./hydra-native, so a macOS cross build impersonates
// the target for the duration of the call: CMake picks the arch up from
// CMAKE_OSX_ARCHITECTURES, ctest runs foreign-arch test binaries through the
// skip emulator, the host files are moved aside and every produced file lands
// in the per-arch folder electron-builder packages. All of it is restored in
// finally, so a failed build never leaves the dev addon broken.
async function withDarwinBridgeTarget(targetArch, build) {
  if (process.platform !== "darwin" || targetArch === process.arch) {
    return build();
  }

  const stageDir = getNativeStageDir(targetArch);
  const hostBackupDir = path.join(
    root,
    "build",
    "native",
    `host-${process.arch}`
  );
  const archDescriptor = Object.getOwnPropertyDescriptor(process, "arch");
  const cmakeArch = process.env.CMAKE_OSX_ARCHITECTURES;
  const emulator = process.env.CMAKE_CROSSCOMPILING_EMULATOR;
  const hadHostOutput = fs.existsSync(bridgeOutputDir);

  if (hadHostOutput) {
    fs.mkdirSync(path.dirname(hostBackupDir), { recursive: true });
    fs.rmSync(hostBackupDir, { recursive: true, force: true });
    fs.renameSync(bridgeOutputDir, hostBackupDir);
  }

  try {
    Object.defineProperty(process, "arch", {
      value: targetArch,
      configurable: true,
    });
    // CMake initialises CMAKE_OSX_ARCHITECTURES from the environment, which is
    // what makes the cross build compile for the target instead of the host.
    process.env.CMAKE_OSX_ARCHITECTURES =
      targetArch === "arm64" ? "arm64" : "x86_64";
    // ctest runs the foreign-arch test binary through this emulator, so it
    // reports the skip instead of failing with "cannot execute".
    process.env.CMAKE_CROSSCOMPILING_EMULATOR = crossTestEmulator;

    const result = await build();

    if (fs.existsSync(bridgeOutputDir)) {
      fs.mkdirSync(stageDir, { recursive: true });
      for (const entry of fs.readdirSync(bridgeOutputDir)) {
        fs.renameSync(
          path.join(bridgeOutputDir, entry),
          path.join(stageDir, entry)
        );
      }
    }
    return result;
  } finally {
    Object.defineProperty(process, "arch", archDescriptor);
    restoreEnv("CMAKE_OSX_ARCHITECTURES", cmakeArch);
    restoreEnv("CMAKE_CROSSCOMPILING_EMULATOR", emulator);
    // Never leave foreign-arch files where the dev app loads the host addon.
    fs.rmSync(bridgeOutputDir, { recursive: true, force: true });
    if (hadHostOutput) fs.renameSync(hostBackupDir, bridgeOutputDir);
  }
}

module.exports = { withDarwinBridgeTarget };
