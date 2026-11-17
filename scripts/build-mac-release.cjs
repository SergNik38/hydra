// Builds the macOS release: one electron-vite build, then a single
// electron-builder run so both dmgs share one latest-mac.yml.
//
// Usage: node scripts/build-mac-release.cjs <version>
//        HYDRA_MAC_VERSION=<version> node scripts/build-mac-release.cjs
//
// macOS keeps its own version so it never collides with the upstream
// Windows/Linux versions that package.json holds. It has to stay a plain
// release semver: electron-updater derives `allowPrerelease` and the update
// channel from the running app version, and a prerelease such as 4.4.1-mac.1
// would make it request mac-mac.yml instead of latest-mac.yml. Scheme:
//
//   <upstream major>.<upstream minor>.<upstream patch * 1000 + fork build>
//
// Upstream 4.4.1 becomes 4.4.1001 for the first mac build, 4.4.1002 for the
// next rebuild, and upstream 4.4.2 becomes 4.4.2001. Publish the GitHub release
// as a normal (not pre-) release: the updater asks GitHub for releases/latest.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { getNativeStageDir } = require("./native-target-arch.cjs");
const { ensureMacArm64OptionalDeps } = require("./mac-arm64-optional-deps.cjs");

const root = path.resolve(__dirname, "..");
const MAC_ARCHS = ["x64", "arm64"];
const RELEASE_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const usage = () =>
  [
    "Usage: node scripts/build-mac-release.cjs <version>",
    "       HYDRA_MAC_VERSION=<version> node scripts/build-mac-release.cjs",
    "",
    "Pass the macOS release version, for example 4.4.1001 for the first mac",
    "build of upstream 4.4.1. It must be a plain release semver: electron-updater",
    "reads the update channel from prerelease components, so versions like",
    "4.4.1-mac.1 are rejected.",
    "",
    "Build the native addon for both architectures first:",
    ...MAC_ARCHS.map(
      (arch) => `  HYDRA_NATIVE_ARCH=${arch} npm run build:native`
    ),
  ].join("\n");

if (process.platform !== "darwin") {
  fail(
    "macOS releases can only be built on macOS (the dmg target needs hdiutil)."
  );
}

const [versionArg, ...extraArgs] = process.argv.slice(2);
if (extraArgs.length > 0) {
  fail(`Unexpected extra arguments: ${extraArgs.join(" ")}\n\n${usage()}`);
}

const version = versionArg || process.env.HYDRA_MAC_VERSION;
if (!version) {
  fail(`Missing release version.\n\n${usage()}`);
}

if (!RELEASE_VERSION_PATTERN.test(version)) {
  fail(`"${version}" is not a plain release version.\n\n${usage()}`);
}

const nativeAddonPath = (arch) =>
  path.join(getNativeStageDir(arch), "hydra-native.node");

const missingArchs = MAC_ARCHS.filter(
  (arch) => !fs.existsSync(nativeAddonPath(arch))
);

if (missingArchs.length > 0) {
  fail(
    [
      `Missing native addon for macOS ${missingArchs.join(", ")}:`,
      ...missingArchs.map((arch) => `  ${nativeAddonPath(arch)}`),
      "Build both architectures first, one per arch folder:",
      ...MAC_ARCHS.map(
        (arch) => `  HYDRA_NATIVE_ARCH=${arch} npm run build:native`
      ),
    ].join("\n")
  );
}

// Yarn 1 only installs the host's optional packages, so building on an Intel
// Mac leaves sharp's darwin-arm64 natives out of node_modules.
try {
  ensureMacArm64OptionalDeps({ projectDir: root });
} catch (error) {
  fail(`Could not install sharp's darwin-arm64 packages: ${error.message}`);
}

const binaryPath = (name) =>
  path.join(
    root,
    "node_modules",
    ".bin",
    process.platform === "win32" ? `${name}.cmd` : name
  );

const run = (command, args) => {
  console.log(`> ${[command, ...args].join(" ")}`);
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error != null) {
    fail(`Failed to run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run(binaryPath("electron-vite"), ["build"]);

// One run for both architectures keeps a single latest-mac.yml that lists both
// dmgs; --publish never leaves the release to the maintainer.
run(binaryPath("electron-builder"), [
  "--mac",
  "dmg",
  "--x64",
  "--arm64",
  "--publish",
  "never",
  `-c.extraMetadata.version=${version}`,
]);

const { name } = require(path.join(root, "package.json"));

console.log(
  [
    "",
    `Built Hydra ${version} for macOS.`,
    "",
    `Publish a normal (not pre-) release tagged v${version} at`,
    "https://github.com/SergNik38/hydra/releases and upload:",
    "  dist/latest-mac.yml",
    ...MAC_ARCHS.flatMap((arch) => [
      `  dist/${name}-${version}-${arch}.dmg`,
      `  dist/${name}-${version}-${arch}.dmg.blockmap`,
    ]),
  ].join("\n")
);
