import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { Readable } from "node:stream";
import axios from "axios";

export type DownloadProgressCallback = (
  receivedBytes: number,
  totalBytes: number | null
) => void;

export interface DownloadVerifiedOptions {
  url: string;
  sha256: string;
  maxBytes: number;
  destination: string;
  timeoutMs: number;
  onProgress?: DownloadProgressCallback;
  signal?: AbortSignal;
}

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const getContentLength = (headers: Record<string, unknown>) => {
  const value = Number(headers["content-length"]);
  return Number.isFinite(value) && value > 0 ? value : null;
};

export const downloadVerified = async ({
  url,
  sha256,
  maxBytes,
  destination,
  timeoutMs,
  onProgress,
  signal,
}: DownloadVerifiedOptions): Promise<void> => {
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  const temporaryPath = `${destination}.${randomUUID()}.tmp`;

  try {
    const response = await axios.get<Readable>(url, {
      responseType: "stream",
      timeout: timeoutMs,
      signal,
      maxContentLength: maxBytes,
      headers: { "User-Agent": "HydraLauncher" },
    });

    const totalBytes = getContentLength(response.headers);
    const hash = createHash("sha256");
    let receivedBytes = 0;
    let settled = false;

    await new Promise<void>((resolve, reject) => {
      const writer = fs.createWriteStream(temporaryPath);

      const cleanup = () => signal?.removeEventListener("abort", onAbort);

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        response.data.destroy();
        writer.destroy();
        reject(toError(error));
      };

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };

      const onAbort = () => fail(new Error("Wine runtime download aborted"));

      if (signal?.aborted) {
        fail(new Error("Wine runtime download aborted"));
        return;
      }
      signal?.addEventListener("abort", onAbort, { once: true });

      response.data.on("data", (chunk: Buffer) => {
        if (settled) return;
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          fail(new Error(`Wine runtime download exceeds ${maxBytes} bytes`));
          return;
        }
        hash.update(chunk);
        onProgress?.(receivedBytes, totalBytes);
      });
      response.data.once("error", fail);
      writer.once("error", fail);
      writer.once("close", finish);
      response.data.pipe(writer);
    });

    if (hash.digest("hex") !== sha256.toLowerCase()) {
      throw new Error("Wine runtime download failed the sha256 check");
    }

    await fs.promises.rename(temporaryPath, destination);
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
};
