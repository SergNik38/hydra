import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export interface WineRuntimeState {
  version: string;
  binaryRelativePath: string;
  installedAt: number;
}

const STATE_FILE_NAME = "state.json";

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const parseWineRuntimeState = (
  value: unknown
): WineRuntimeState | null => {
  if (typeof value !== "object" || value === null) return null;
  const state = value as Record<string, unknown>;
  if (!isNonEmptyString(state.version)) return null;
  if (!isNonEmptyString(state.binaryRelativePath)) return null;
  if (
    typeof state.installedAt !== "number" ||
    !Number.isFinite(state.installedAt) ||
    state.installedAt <= 0
  ) {
    return null;
  }
  return {
    version: state.version,
    binaryRelativePath: state.binaryRelativePath,
    installedAt: state.installedAt,
  };
};

const getStatePath = (managedDirectory: string) =>
  path.join(managedDirectory, STATE_FILE_NAME);

export const readWineRuntimeState = (
  managedDirectory: string
): WineRuntimeState | null => {
  try {
    return parseWineRuntimeState(
      JSON.parse(fs.readFileSync(getStatePath(managedDirectory), "utf8"))
    );
  } catch {
    return null;
  }
};

export const writeWineRuntimeState = async (
  managedDirectory: string,
  state: WineRuntimeState
): Promise<void> => {
  await fs.promises.mkdir(managedDirectory, { recursive: true });
  const statePath = getStatePath(managedDirectory);
  const temporaryPath = `${statePath}.${randomUUID()}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(state));
  await fs.promises.rename(temporaryPath, statePath);
};
