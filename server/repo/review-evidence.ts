import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

export type RepoReviewEvidenceInput = {
  repoRoot: string;
  diffText?: string;
  changedFiles?: string[];
  focus?: string;
};

export type RepoAdrReference = {
  path: string;
  title: string;
  evidenceId?: string;
};

export type RepoRiskItem = {
  category: "security" | "architecture" | "delivery" | "cost";
  severity: "low" | "medium" | "high";
  reason: string;
};

export type RepoReviewEvidence = {
  changedFiles: string[];
  diffSummary: string;
  diffText?: string;
  adrReferences: RepoAdrReference[];
  riskRadar: RepoRiskItem[];
  evidenceIds: string[];
  changeImpact: RepoChangeImpact[];
};

export type RepoChangeImpact = {
  evidenceId: string;
  path: string;
  touchedBoundaries: string[];
  apiSurfaceTouched: boolean;
  riskTags: Array<"security" | "api" | "ui" | "data" | "docs" | "tests">;
};

export function buildRepoReviewEvidence(input: RepoReviewEvidenceInput): RepoReviewEvidence {
  const repoRoot = resolve(input.repoRoot);
  const changedFiles = normalizeChangedFiles({
    repoRoot,
    changedFiles: input.changedFiles,
    diffText: input.diffText
  });
  const diffSummary = `${changedFiles.length} files changed`;
  const adrReferences = findAdrReferences(repoRoot, input.focus);

  return {
    changedFiles,
    diffSummary,
    ...(input.diffText ? { diffText: input.diffText } : {}),
    adrReferences,
    riskRadar: buildRiskRadar(changedFiles, input.diffText ?? "", input.focus ?? ""),
    evidenceIds: [
      ...changedFiles.map((file) => evidenceId("change", file)),
      ...adrReferences.map((adr) => evidenceId("adr", adr.path))
    ],
    changeImpact: buildChangeImpact(changedFiles, input.diffText ?? "")
  };
}

function normalizeChangedFiles(input: {
  repoRoot: string;
  changedFiles?: string[];
  diffText?: string;
}): string[] {
  const candidates = new Set<string>();

  for (const file of input.changedFiles ?? []) {
    if (isSafeRelativePath(file)) {
      candidates.add(normalizeRelativePath(file));
    }
  }

  for (const line of (input.diffText ?? "").split("\n")) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      const candidate = normalizeRelativePath(match[2]);
      if (isInsideRepo(input.repoRoot, candidate)) {
        candidates.add(candidate);
      }
    }
  }

  return [...candidates].sort();
}

function buildRiskRadar(changedFiles: string[], diffText: string, focus: string): RepoRiskItem[] {
  const lower = `${changedFiles.join(" ")} ${diffText} ${focus}`.toLowerCase();
  const risks: RepoRiskItem[] = [];

  if (/auth|token|secret|permission|credential/.test(lower)) {
    risks.push({
      category: "security",
      severity: "high",
      reason: "Diff touches auth or secret-handling paths."
    });
  }

  if (/api|route|workflow|orchestr|agent|runner/.test(lower)) {
    risks.push({
      category: "architecture",
      severity: "medium",
      reason: "Diff changes an orchestration or API surface."
    });
  }

  if (changedFiles.length > 3) {
    risks.push({
      category: "delivery",
      severity: "medium",
      reason: "Broad change set may need staged rollout."
    });
  }

  if (risks.length === 0) {
    risks.push({
      category: "cost",
      severity: "low",
      reason: "No immediate high-risk area detected from the supplied evidence."
    });
  }

  return risks;
}

function findAdrReferences(repoRoot: string, focus?: string): RepoAdrReference[] {
  if (!existsSync(repoRoot)) {
    return [];
  }

  const entries = readdirSync(repoRoot, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isFile()) {
      return [];
    }

    if (!/^ADR-.*\.md$/i.test(entry.name)) {
      return [];
    }

    const full = join(repoRoot, entry.name);
    const content = readFileSync(full, "utf8");
    const title = content.split("\n").find((line) => line.startsWith("#"))?.replace(/^#\s*/, "") ?? entry.name;

    const focusTerms = focus?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
    if (focusTerms.length > 0 && !focusTerms.some((term) => content.toLowerCase().includes(term))) {
      return [];
    }

    const path = relative(repoRoot, full);
    return [{ path, title, evidenceId: evidenceId("adr", path) }];
  });

  return entries.slice(0, 5);
}

function buildChangeImpact(changedFiles: string[], diffText: string): RepoChangeImpact[] {
  return changedFiles.map((path) => {
    const boundary = topLevelBoundary(path);
    const riskTags = riskTagsForChange(path, diffText);

    return {
      evidenceId: evidenceId("change", path),
      path,
      touchedBoundaries: boundary ? [boundary] : [],
      apiSurfaceTouched: isApiSurfacePath(path),
      riskTags
    };
  });
}

function riskTagsForChange(path: string, diffText: string): RepoChangeImpact["riskTags"] {
  const lower = `${path} ${diffText}`.toLowerCase();
  const tags = new Set<RepoChangeImpact["riskTags"][number]>();

  if (/auth|token|secret|permission|credential/.test(lower)) tags.add("security");
  if (isApiSurfacePath(path)) tags.add("api");
  if (/src\/|component|tsx|css/.test(lower)) tags.add("ui");
  if (/schema|migration|sql|database|postgres/.test(lower)) tags.add("data");
  if (/docs|adr|readme/.test(lower)) tags.add("docs");
  if (/test|spec|vitest|jest|ci|workflow/.test(lower)) tags.add("tests");

  return [...tags];
}

function topLevelBoundary(path: string): string {
  return path.split("/")[0] ?? path;
}

function isApiSurfacePath(path: string): boolean {
  return /(^|\/)(api|routes?|controllers?)\//i.test(path) || /server\/|src\/App\.tsx|\.tsx$/.test(path);
}

function evidenceId(kind: "change" | "adr", path: string): string {
  return `${kind}:${normalizeRelativePath(path)}`;
}

function isSafeRelativePath(pathValue: string): boolean {
  return !pathValue.startsWith("/") && !pathValue.includes("..");
}

function normalizeRelativePath(pathValue: string): string {
  return pathValue.replace(/^[.\\/]+/, "").replace(/\\/g, "/");
}

function isInsideRepo(repoRoot: string, relativePath: string): boolean {
  const full = resolve(repoRoot, relativePath);
  return full.startsWith(resolve(repoRoot));
}
