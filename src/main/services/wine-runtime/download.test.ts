import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

// @ts-ignore The Node ESM test runner requires the source extension.
import { downloadVerified } from "./download.ts";

const sha256 = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");

const withServer = async (
  body: Buffer,
  run: (url: string) => Promise<void>
) => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "content-length": body.length });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const address = server.address();
  if (!address || typeof address !== "object") {
    throw new Error("test server did not bind to a port");
  }

  try {
    await run(`http://127.0.0.1:${address.port}/artifact`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
};

const withTempDir = async (run: (directory: string) => Promise<void>) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "hydra-wine-download-")
  );
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
};

describe("downloadVerified", () => {
  it("streams the file into place when the hash matches", async () => {
    const body = Buffer.from("wine runtime fixture payload");
    const progress: number[] = [];

    await withServer(body, async (url) => {
      await withTempDir(async (directory) => {
        const destination = path.join(directory, "artifact.tar.xz");

        await downloadVerified({
          url,
          sha256: sha256(body),
          maxBytes: 1024,
          destination,
          timeoutMs: 5_000,
          onProgress: (received, total) => {
            progress.push(received);
            assert.equal(total, body.length);
          },
        });

        assert.deepEqual(await fs.readFile(destination), body);
        assert.deepEqual(await fs.readdir(directory), ["artifact.tar.xz"]);
        assert.equal(progress.at(-1), body.length);
      });
    });
  });

  it("throws and leaves nothing behind when the hash is wrong", async () => {
    const body = Buffer.from("wine runtime fixture payload");

    await withServer(body, async (url) => {
      await withTempDir(async (directory) => {
        const destination = path.join(directory, "artifact.tar.xz");

        await assert.rejects(
          downloadVerified({
            url,
            sha256: "0".repeat(64),
            maxBytes: 1024,
            destination,
            timeoutMs: 5_000,
          }),
          /sha256/
        );

        assert.deepEqual(await fs.readdir(directory), []);
      });
    });
  });

  it("aborts a body over maxBytes and leaves nothing behind", async () => {
    const body = Buffer.alloc(4096, 1);

    await withServer(body, async (url) => {
      await withTempDir(async (directory) => {
        const destination = path.join(directory, "artifact.tar.xz");

        await assert.rejects(
          downloadVerified({
            url,
            sha256: sha256(body),
            maxBytes: 1024,
            destination,
            timeoutMs: 5_000,
          }),
          /maxContentLength|exceeds/
        );

        assert.deepEqual(await fs.readdir(directory), []);
      });
    });
  });
});
