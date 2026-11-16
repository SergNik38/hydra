import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { isRosettaAvailable, needsRosetta } from "./rosetta.ts";

describe("needsRosetta", () => {
  it("is required on Apple Silicon", () => {
    assert.equal(needsRosetta("arm64"), true);
  });

  it("is not required on Intel", () => {
    assert.equal(needsRosetta("x64"), false);
  });
});

describe("isRosettaAvailable", () => {
  it("probes arch with x86_64 true and returns true on exit 0", async () => {
    let command = "";
    let args: string[] = [];

    const available = await isRosettaAvailable(async (probe, probeArgs) => {
      command = probe;
      args = probeArgs;
      return 0;
    });

    assert.equal(available, true);
    assert.equal(command, "/usr/bin/arch");
    assert.deepEqual(args, ["-x86_64", "/usr/bin/true"]);
  });

  it("returns false on a non-zero exit", async () => {
    assert.equal(await isRosettaAvailable(async () => 1), false);
  });

  it("returns false when the runner throws", async () => {
    assert.equal(
      await isRosettaAvailable(async () => {
        throw new Error("spawn failed");
      }),
      false
    );
  });
});
