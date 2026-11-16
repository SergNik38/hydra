import type { DownloadProgressCallback } from "@main/services/wine-runtime/download";

const BYTES_PER_MB = 1024 * 1024;

const formatProgress = (receivedBytes: number, totalBytes: number | null) => {
  if (totalBytes && totalBytes > 0) {
    const percent = Math.min(
      100,
      Math.max(0, Math.round((receivedBytes / totalBytes) * 100))
    );
    return `Wine ${percent}%`;
  }

  return `Wine ${Math.floor(receivedBytes / BYTES_PER_MB)} MB`;
};

/**
 * Turns download progress into launcher status details, reporting only when
 * the displayed value actually changes (progress ticks are frequent).
 */
export const createWineRuntimeProgressReporter = (
  report: (message: string) => void
): DownloadProgressCallback => {
  let lastMessage: string | null = null;

  return (receivedBytes, totalBytes) => {
    const message = formatProgress(receivedBytes, totalBytes);
    if (message === lastMessage) return;
    lastMessage = message;
    report(message);
  };
};
