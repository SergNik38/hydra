const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  ensureMacArm64OptionalDeps,
  getMacArm64OptionalDeps,
} = require("./mac-arm64-optional-deps.cjs");

const ARM64_DEPS = {
  "@img/sharp-darwin-arm64": "0.35.0",
  "@img/sharp-libvips-darwin-arm64": "1.3.0",
};

function createProject(deps) {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "hydra-arm64-deps-")
  );
  const sharpDir = path.join(projectDir, "node_modules", "sharp");
  fs.mkdirSync(sharpDir, { recursive: true });
  fs.writeFileSync(
    path.join(sharpDir, "package.json"),
    JSON.stringify({ optionalDependencies: deps })
  );
  return projectDir;
}

function writeInstalledPackage(projectDir, name, version) {
  const directory = path.join(projectDir, "node_modules", name);
  fs.mkdirSync(path.join(directory, "lib"), { recursive: true });
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ name, version })
  );
  fs.writeFileSync(path.join(directory, "lib", "x.dylib"), "binary");
}

// A minimal npm tarball: package/package.json plus package/lib/x.dylib.
function createTarball(tarball, version) {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), "hydra-tarball-"));
  try {
    fs.mkdirSync(path.join(source, "package", "lib"), { recursive: true });
    fs.writeFileSync(
      path.join(source, "package", "package.json"),
      JSON.stringify({ version })
    );
    fs.writeFileSync(path.join(source, "package", "lib", "x.dylib"), "binary");
    execFileSync("/usr/bin/tar", ["-czf", tarball, "-C", source, "package"]);
  } finally {
    fs.rmSync(source, { recursive: true, force: true });
  }
}

// Stands in for `npm pack` (no network) and lets tar extraction run for real.
function createFakeRun() {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === "/usr/bin/tar") {
      execFileSync(command, args);
      return;
    }
    assert.equal(command, "npm");
    assert.equal(args[0], "pack");
    const destination = args[args.indexOf("--pack-destination") + 1];
    const [name, version] = args[1].match(/^(.+)@([^@]+)$/).slice(1);
    const tarballName = `${name.replace(/^@[^/]+\//, "")}-${version}.tgz`;
    fs.mkdirSync(destination, { recursive: true });
    createTarball(path.join(destination, tarballName), version);
  };
  return { calls, run };
}

test("selects only sharp's darwin-arm64 optional dependencies", () => {
  const deps = getMacArm64OptionalDeps({
    optionalDependencies: {
      "@img/sharp-darwin-arm64": "0.35.0",
      "@img/sharp-darwin-x64": "0.35.0",
      "@img/sharp-libvips-darwin-arm64": "1.3.0",
      "@img/sharp-linux-x64": "1.3.0",
      "@img/sharp-win32-arm64": "0.35.0",
    },
  });

  assert.deepEqual(deps, [
    { name: "@img/sharp-darwin-arm64", version: "0.35.0" },
    { name: "@img/sharp-libvips-darwin-arm64", version: "1.3.0" },
  ]);
  assert.deepEqual(getMacArm64OptionalDeps({}), []);
});

test("skips a package that is already installed at the pinned version", (t) => {
  const projectDir = createProject(ARM64_DEPS);
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  for (const [name, version] of Object.entries(ARM64_DEPS)) {
    writeInstalledPackage(projectDir, name, version);
  }

  const lines = [];
  const result = ensureMacArm64OptionalDeps({
    projectDir,
    run: () => assert.fail("nothing should be packed"),
    log: (line) => lines.push(line),
    getArchs: () => assert.fail("nothing should be verified"),
  });

  assert.deepEqual(result.installed, []);
  assert.deepEqual(result.skipped, Object.keys(ARM64_DEPS));
  assert.match(lines.join("\n"), /already installed/);
});

test("replaces a package installed at the wrong version", (t) => {
  const projectDir = createProject(ARM64_DEPS);
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));
  writeInstalledPackage(projectDir, "@img/sharp-darwin-arm64", "0.34.0");

  const { calls, run } = createFakeRun();
  const result = ensureMacArm64OptionalDeps({
    projectDir,
    run,
    log: () => {},
    getArchs: () => "arm64",
  });

  assert.deepEqual(result.installed, Object.keys(ARM64_DEPS));
  const installed = JSON.parse(
    fs.readFileSync(
      path.join(
        projectDir,
        "node_modules",
        "@img/sharp-darwin-arm64/package.json"
      ),
      "utf8"
    )
  );
  assert.equal(installed.version, "0.35.0");
  assert.ok(calls.some((call) => call.includes("--pack-destination")));
});

test("packs, extracts and installs the missing packages", (t) => {
  const projectDir = createProject(ARM64_DEPS);
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  const { calls, run } = createFakeRun();
  const result = ensureMacArm64OptionalDeps({
    projectDir,
    run,
    log: () => {},
    getArchs: () => "x86_64 arm64",
  });

  assert.deepEqual(result.installed, Object.keys(ARM64_DEPS));
  assert.deepEqual(result.skipped, []);
  for (const name of Object.keys(ARM64_DEPS)) {
    const directory = path.join(projectDir, "node_modules", name);
    assert.ok(fs.existsSync(path.join(directory, "lib", "x.dylib")));
    const manifest = JSON.parse(
      fs.readFileSync(path.join(directory, "package.json"), "utf8")
    );
    assert.equal(manifest.version, ARM64_DEPS[name]);
  }
  assert.equal(
    fs.existsSync(
      path.join(
        projectDir,
        ".cache",
        "mac-arm64-deps",
        "sharp-darwin-arm64-0.35.0.tgz"
      )
    ),
    true
  );
  assert.ok(
    calls.some(
      ([command, ...args]) =>
        command === "/usr/bin/tar" &&
        args.includes("--strip-components") &&
        args.includes("1")
    )
  );
});

test("throws when the extracted binaries are not arm64", (t) => {
  const projectDir = createProject({ "@img/sharp-darwin-arm64": "0.35.0" });
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  const { run } = createFakeRun();
  assert.throws(
    () =>
      ensureMacArm64OptionalDeps({
        projectDir,
        run,
        log: () => {},
        getArchs: () => "x86_64",
      }),
    /is not an arm64 binary/
  );
  // A rejected package must not be left behind, or the version check would
  // skip it on the next build.
  assert.equal(
    fs.existsSync(
      path.join(projectDir, "node_modules", "@img/sharp-darwin-arm64")
    ),
    false
  );
});

test("throws when sharp is not installed", (t) => {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "hydra-arm64-deps-")
  );
  t.after(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  assert.throws(
    () => ensureMacArm64OptionalDeps({ projectDir, log: () => {} }),
    /sharp is not installed/
  );
});
