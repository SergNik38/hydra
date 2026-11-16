import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { createWineRuntimeProgressReporter } from "./wine-runtime-progress.ts";

const MB = 1024 * 1024;

const collect = () => {
  const messages: string[] = [];
  const reporter = createWineRuntimeProgressReporter((message) => {
    messages.push(message);
  });

  return { messages, reporter };
};

describe("createWineRuntimeProgressReporter", () => {
  it("reports every percent change once", () => {
    const { messages, reporter } = collect();

    for (let percent = 0; percent <= 100; percent++) {
      reporter(percent * 10, 1000);
      reporter(percent * 10 + 1, 1000);
    }

    assert.deepEqual(
      messages,
      Array.from({ length: 101 }, (_, percent) => `Wine ${percent}%`)
    );
  });

  it("does not re-report the same percent", () => {
    const { messages, reporter } = collect();

    reporter(0, 1000);
    reporter(4, 1000);
    reporter(9, 1000);
    reporter(10, 1000);
    reporter(10, 1000);
    reporter(14, 1000);

    assert.deepEqual(messages, ["Wine 0%", "Wine 1%"]);
  });

  it("falls back to whole megabytes without a total", () => {
    const { messages, reporter } = collect();

    reporter(0, null);
    reporter(37 * MB + 512, null);
    reporter(38 * MB, null);
    reporter(38 * MB + 1, null);

    assert.deepEqual(messages, ["Wine 0 MB", "Wine 37 MB", "Wine 38 MB"]);
  });

  it("never reports above 100 percent", () => {
    const { messages, reporter } = collect();

    reporter(2000, 1000);

    assert.deepEqual(messages, ["Wine 100%"]);
  });
});
