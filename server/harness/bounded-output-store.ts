import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { safeSegment } from "./run-event-store";

export type BoundedOutputRef = {
  label: string;
  mime: "text/plain" | "application/json";
  preview: string;
  inline?: string;
  path?: string;
  redacted?: boolean;
  truncated: boolean;
  originalChars: number;
  omittedChars: number;
  sha256: string;
};

export type BoundOutputOptions = {
  label: string;
  maxInlineChars?: number;
  previewHeadChars?: number;
  previewTailChars?: number;
  storageDir?: string;
  runId?: string;
  redactSecrets?: boolean;
};

export function boundOutput(value: unknown, options: BoundOutputOptions): BoundedOutputRef {
  const serialized = serializeOutput(value);
  const outputText = options.redactSecrets ? redactSensitiveText(serialized.text) : serialized.text;
  const maxInlineChars = options.maxInlineChars ?? 2_000;
  const previewHeadChars = options.previewHeadChars ?? 800;
  const previewTailChars = options.previewTailChars ?? 400;
  const truncated = outputText.length > maxInlineChars;
  const preview = truncated
    ? `${outputText.slice(0, previewHeadChars)}...${outputText.slice(-previewTailChars)}`
    : outputText;
  const sha256 = createHash("sha256").update(serialized.text).digest("hex");
  const path =
    truncated && options.storageDir
      ? writeOutputArtifact({
          text: outputText,
          mime: serialized.mime,
          storageDir: options.storageDir,
          runId: options.runId,
          label: options.label,
          sha256
        })
      : undefined;

  return {
    label: options.label,
    mime: serialized.mime,
    preview,
    ...(path ? { path } : {}),
    ...(options.redactSecrets && outputText !== serialized.text ? { redacted: true } : {}),
    ...(truncated ? {} : { inline: outputText }),
    truncated,
    originalChars: serialized.text.length,
    omittedChars: truncated ? Math.max(0, serialized.text.length - preview.length + 3) : 0,
    sha256
  };
}

export function redactSensitiveText(text: string): string {
  return text
    .replace(/\b(?:sk|pk|rk|ak)-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/(?:\/Users\/|\/home\/)[^\s"'`<>]+/g, "[REDACTED_PATH]")
    .replace(/\b((?:OPENAI|DEEPSEEK|GEMINI|MODEL_GATEWAY|ANTHROPIC|OPENROUTER)_API_KEY)\s*=\s*[^\s]+/g, "$1=[REDACTED_API_KEY]");
}

function serializeOutput(value: unknown): { text: string; mime: "text/plain" | "application/json" } {
  if (typeof value === "string") {
    return { text: value, mime: "text/plain" };
  }

  try {
    return {
      text: JSON.stringify(value, null, 2),
      mime: "application/json"
    };
  } catch {
    return {
      text: String(value),
      mime: "text/plain"
    };
  }
}

function writeOutputArtifact(input: {
  text: string;
  mime: "text/plain" | "application/json";
  storageDir: string;
  runId?: string;
  label: string;
  sha256: string;
}): string {
  const baseDir = input.runId
    ? join(input.storageDir, "runs", safeSegment(input.runId), "outputs")
    : input.storageDir;
  const extension = input.mime === "application/json" ? "json" : "txt";
  const filename = `${safeSegment(input.label)}-${input.sha256.slice(0, 12)}.${extension}`;
  const path = join(baseDir, filename);

  mkdirSync(baseDir, { recursive: true });
  writeFileSync(path, input.text, "utf8");
  return path;
}
