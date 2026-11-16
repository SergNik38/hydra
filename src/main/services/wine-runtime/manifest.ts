import manifestJson from "../../../shared/wine-runtime-manifest.json" with { type: "json" };

export interface WineRuntimeArtifact {
  fileName: string;
  url: string;
  sha256: string;
  sizeBytes: number;
}

export interface WineRuntimeManifest {
  version: string;
  license: string;
  sourceUrl: string;
  artifact: WineRuntimeArtifact;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isHttpsUrl = (value: unknown): value is string => {
  if (!isNonEmptyString(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

const parseArtifact = (value: unknown): WineRuntimeArtifact => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Wine runtime manifest is missing an artifact");
  }
  const artifact = value as Record<string, unknown>;
  if (!isNonEmptyString(artifact.fileName)) {
    throw new Error("Wine runtime manifest artifact has no fileName");
  }
  if (!isHttpsUrl(artifact.url)) {
    throw new Error("Wine runtime manifest artifact url must be https");
  }
  if (
    !isNonEmptyString(artifact.sha256) ||
    !SHA256_PATTERN.test(artifact.sha256)
  ) {
    throw new Error("Wine runtime manifest artifact sha256 is invalid");
  }
  if (!isPositiveNumber(artifact.sizeBytes)) {
    throw new Error("Wine runtime manifest artifact sizeBytes is invalid");
  }
  return {
    fileName: artifact.fileName,
    url: artifact.url,
    sha256: artifact.sha256.toLowerCase(),
    sizeBytes: artifact.sizeBytes,
  };
};

export const parseWineRuntimeManifest = (
  value: unknown
): WineRuntimeManifest => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Wine runtime manifest is invalid");
  }
  const manifest = value as Record<string, unknown>;
  if (!isNonEmptyString(manifest.version)) {
    throw new Error("Wine runtime manifest has no version");
  }
  if (!isNonEmptyString(manifest.license)) {
    throw new Error("Wine runtime manifest has no license");
  }
  if (!isHttpsUrl(manifest.sourceUrl)) {
    throw new Error("Wine runtime manifest sourceUrl must be https");
  }
  return {
    version: manifest.version,
    license: manifest.license,
    sourceUrl: manifest.sourceUrl,
    artifact: parseArtifact(manifest.artifact),
  };
};

export const wineRuntimeManifest = parseWineRuntimeManifest(manifestJson);
