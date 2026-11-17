// Yarn 1 installs only the optional platform packages of the host machine.
// Building the arm64 mac app on an Intel Mac therefore leaves @img/sharp-darwin-arm64
// and @img/sharp-libvips-darwin-arm64 out of node_modules, and the arm64 app
// crashes at startup with `Could not load the "sharp" module using the
// darwin-arm64 runtime`. This module fetches exactly the pinned arm64 packages
// with `npm pack` (no install scripts, no lockfile changes) and verifies that
// the extracted binaries really are arm64.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ARM64_SUFFIX = "-darwin-arm64";
const PACK_CACHE_DIR = path.join(".cache", "mac-arm64-deps");
const BINARY_EXTENSIONS = new Set([".node", ".dylib"]);

// stdout is captured (npm pack prints the tarball name there) while npm's
// notices keep going to stderr, so the build log stays readable.
const defaultRun = (command, args, options) => {
  const stdout = execFileSync(command, args, {
    stdio: ["ignore", "pipe", "inherit"],
    ...options,
  });
  return stdout == null ? "" : String(stdout);
};

const defaultGetArchs = (binary) =>
  execFileSync("/usr/bin/lipo", ["-archs", binary], { encoding: "utf8" });

// Pure: the arm64 entries of sharp's optional dependencies, versions included.
function getMacArm64OptionalDeps(sharpPackageJson) {
  const optionalDependencies = sharpPackageJson?.optionalDependencies ?? {};
  return Object.entries(optionalDependencies)
    .filter(([name]) => name.endsWith(ARM64_SUFFIX))
    .map(([name, version]) => ({ name, version }));
}

const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// A wrong-but-present version must be replaced, so compare, not just check.
const installedVersion = (projectDir, name) =>
  readJson(path.join(projectDir, "node_modules", name, "package.json"))
    ?.version;

function listBinaries(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listBinaries(entryPath);
    return BINARY_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function verifyArm64Binaries(directory, getArchs) {
  const libDir = path.join(directory, "lib");
  const binaries = listBinaries(libDir);
  if (binaries.length === 0) {
    throw new Error(
      `No .node or .dylib files found under ${libDir}; the package layout is not what we expect.`
    );
  }
  for (const binary of binaries) {
    const archs = (getArchs(binary) ?? "").trim();
    if (!archs.split(/\s+/).includes("arm64")) {
      throw new Error(
        `Refusing to use ${binary}: it is not an arm64 binary (lipo -archs: ${archs || "unknown"}).`
      );
    }
  }
}

// Extract next to the destination so the final rename stays on one filesystem.
function extractTarball(tarball, destination, run) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = fs.mkdtempSync(
    path.join(path.dirname(destination), ".hydra-mac-arm64-")
  );
  try {
    run(
      "/usr/bin/tar",
      ["-xzf", tarball, "--strip-components", "1", "-C", temporary],
      { cwd: temporary }
    );
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  return temporary;
}

// npm names scoped tarballs without the @scope/ prefix:
// @img/sharp-darwin-arm64@0.35.0 -> img-sharp-darwin-arm64-0.35.0.tgz
const tarballFileName = (dep) =>
  `${dep.name.replace(/^@/, "").replace("/", "-")}-${dep.version}.tgz`;

const lastNonEmptyLine = (stdout) =>
  String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop() ?? "";

// Trust what npm pack reported, fall back to npm's naming rule, then insist the
// file is really there so a silent change in npm's output cannot slip through.
function resolveTarball(packDir, dep, stdout) {
  const reported = lastNonEmptyLine(stdout);
  const candidates = [...new Set([reported, tarballFileName(dep)])]
    .filter(Boolean)
    .map((name) => path.join(packDir, path.basename(name)));
  const tarball = candidates.find((file) => fs.existsSync(file));
  if (!tarball) {
    throw new Error(
      `npm pack did not produce a tarball for ${dep.name}@${dep.version} in ${packDir} (looked for ${candidates.join(", ")}).`
    );
  }
  return tarball;
}

function installDep(dep, { projectDir, run, log, getArchs }) {
  const packDir = path.join(projectDir, PACK_CACHE_DIR);
  fs.mkdirSync(packDir, { recursive: true });

  // Drop a leftover from an earlier run so the existence check means something.
  fs.rmSync(path.join(packDir, tarballFileName(dep)), { force: true });
  log(`Packing ${dep.name}@${dep.version} for darwin-arm64...`);
  const stdout = run(
    "npm",
    ["pack", `${dep.name}@${dep.version}`, "--pack-destination", packDir],
    {
      cwd: projectDir,
    }
  );
  const tarball = resolveTarball(packDir, dep, stdout);

  const destination = path.join(projectDir, "node_modules", dep.name);
  const temporary = extractTarball(tarball, destination, run);
  try {
    // Verify before installing: a half-installed wrong-arch package would be
    // skipped by the next run because its version already matches.
    verifyArm64Binaries(temporary, getArchs);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(temporary, destination);
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
  log(`Installed ${dep.name}@${dep.version} (darwin-arm64).`);
}

function ensureMacArm64OptionalDeps({
  projectDir,
  run = defaultRun,
  log = console.log,
  getArchs = defaultGetArchs,
}) {
  const sharpManifest = path.join(
    projectDir,
    "node_modules",
    "sharp",
    "package.json"
  );
  if (!fs.existsSync(sharpManifest)) {
    throw new Error(
      `sharp is not installed (${sharpManifest} is missing). Run yarn install first.`
    );
  }

  const deps = getMacArm64OptionalDeps(readJson(sharpManifest));
  if (deps.length === 0) {
    throw new Error(
      `sharp lists no ${ARM64_SUFFIX} optional dependencies in ${sharpManifest}.`
    );
  }

  const installed = [];
  const skipped = [];
  for (const dep of deps) {
    if (installedVersion(projectDir, dep.name) === dep.version) {
      log(`${dep.name}@${dep.version} is already installed.`);
      skipped.push(dep.name);
      continue;
    }
    installDep(dep, { projectDir, run, log, getArchs });
    installed.push(dep.name);
  }
  return { installed, skipped };
}

module.exports = { getMacArm64OptionalDeps, ensureMacArm64OptionalDeps };
