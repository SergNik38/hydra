import assert from "node:assert/strict";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { runSingleFlight } from "./single-flight.ts";

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("runSingleFlight", () => {
  it("shares one run between concurrent callers of the same key", async () => {
    const gate = deferred();
    let runs = 0;

    const task = async () => {
      runs += 1;
      await gate.promise;
      return "done";
    };

    const first = runSingleFlight("shared", task);
    const second = runSingleFlight("shared", task);
    gate.resolve();

    assert.deepEqual(await Promise.all([first, second]), ["done", "done"]);
    assert.equal(runs, 1);
  });

  it("runs again once the previous run settled", async () => {
    let runs = 0;
    const task = async () => {
      runs += 1;
      return runs;
    };

    assert.equal(await runSingleFlight("sequential", task), 1);
    assert.equal(await runSingleFlight("sequential", task), 2);
  });

  it("keeps different keys independent", async () => {
    const gate = deferred();
    const keys: string[] = [];

    const task = (key: string) => async () => {
      keys.push(key);
      await gate.promise;
      return key;
    };

    const first = runSingleFlight("prefix-a", task("a"));
    const second = runSingleFlight("prefix-b", task("b"));
    gate.resolve();

    assert.deepEqual(await Promise.all([first, second]), ["a", "b"]);
    assert.deepEqual(keys.sort(), ["a", "b"]);
  });

  it("lets a later caller retry after a failure", async () => {
    const gate = deferred();
    let runs = 0;

    const failing = runSingleFlight("retry", async () => {
      runs += 1;
      await gate.promise;
      throw new Error("boom");
    });
    const shared = runSingleFlight("retry", async () => {
      runs += 1;
      return "never";
    });
    gate.resolve();

    await assert.rejects(failing, /boom/);
    await assert.rejects(shared, /boom/);
    assert.equal(runs, 1);

    assert.equal(await runSingleFlight("retry", async () => "ok"), "ok");
  });
});
