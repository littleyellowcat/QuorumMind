import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

export type RepoWorkspaceModelInput = {
  repoRoot: string;
  selectedFiles?: string[];
  diffText?: string;
  testOutput?: string;
  ciStatus?: "passing" | "failing" | "unknown";
};

export type RepoWorkspaceModel = {
  fileTree: Array<{ path: string; kind: "file" | "directory"; size?: number }>;
  selectedFiles: Array<{ path: string; lineCount: number; preview: string; evidenceId: string }>;
  adrHistory: Array<{ path: string; title: string; evidenceId: string }>;
  dependencyGraph: {
    nodes: Array<{ id: string; kind: "package" | "source" }>;
    edges: Array<{ from: string; to: string; kind: "depends_on" | "contains" | "imports" }>;
  };
  architectureGraph: {
    nodes: Array<{ id: string; label: string; kind: string }>;
    edges: Array<{ from: string; to: string; label: string }>;
  };
  architectureBoundaries: Array<{ id: string; pathPrefix: string; kind: "server" | "frontend" | "docs" | "tests" | "config" | "other"; fileCount: number }>;
  apiSurface: Array<{ id: string; file: string; exportName: string; kind: "const" | "function" | "class" | "type" | "interface" | "default" | "named" }>;
  evidenceIndex: Array<{ id: string; type: "file" | "adr" | "dependency" | "api_surface" | "change"; path?: string; summary: string }>;
  changeImpact: Array<{ evidenceId: string; path: string; churn: number; touchedBoundaries: string[]; apiSurfaceIds: string[] }>;
  codeHotspots: Array<{ path: string; churn: number }>;
  testEvidence: { status: "passed" | "failed" | "unknown"; raw?: string };
  ciEvidence: { status: "passing" | "failing" | "unknown" };
};

export function buildRepoWorkspaceModel(input: RepoWorkspaceModelInput): RepoWorkspaceModel {
  const repoRoot = resolve(input.repoRoot);
  const fileTree = listFileTree(repoRoot);
  const selectedFiles = (input.selectedFiles ?? []).flatMap((file) => selectedFileSummary(repoRoot, file));
  const adrHistory = findAdrHistory(repoRoot);
  const dependencyGraph = buildDependencyGraph(repoRoot, fileTree);
  const architectureBoundaries = buildArchitectureBoundaries(fileTree);
  const apiSurface = buildApiSurface(repoRoot, fileTree);
  const codeHotspots = buildHotspots(input.diffText ?? "");
  const changeImpact = buildChangeImpact(codeHotspots, architectureBoundaries, apiSurface);

  return {
    fileTree,
    selectedFiles,
    adrHistory,
    dependencyGraph,
    architectureGraph: buildArchitectureGraph(fileTree),
    architectureBoundaries,
    apiSurface,
    evidenceIndex: buildEvidenceIndex({
      selectedFiles,
      adrHistory,
      dependencyGraph,
      apiSurface,
      changeImpact
    }),
    changeImpact,
    codeHotspots,
    testEvidence: {
      status: inferTestStatus(input.testOutput),
      ...(input.testOutput ? { raw: input.testOutput } : {})
    },
    ciEvidence: {
      status: input.ciStatus ?? "unknown"
    }
  };
}

function listFileTree(repoRoot: string, dir = repoRoot, depth = 0): RepoWorkspaceModel["fileTree"] {
  if (!existsSync(dir) || depth > 3) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist")
    .flatMap((entry) => {
      const full = join(dir, entry.name);
      const path = relative(repoRoot, full).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        return [{ path, kind: "directory" as const }, ...listFileTree(repoRoot, full, depth + 1)];
      }
      return [{ path, kind: "file" as const, size: statSync(full).size }];
    })
    .slice(0, 300);
}

function selectedFileSummary(repoRoot: string, path: string): RepoWorkspaceModel["selectedFiles"] {
  if (path.includes("..") || path.startsWith("/")) {
    return [];
  }

  const full = resolve(repoRoot, path);
  if (!full.startsWith(repoRoot) || !existsSync(full)) {
    return [];
  }

  const content = readFileSync(full, "utf8");
  return [{
    path,
    lineCount: content.split("\n").filter((line) => line.length > 0).length,
    preview: content.slice(0, 500),
    evidenceId: evidenceId("file", path)
  }];
}

function findAdrHistory(repoRoot: string): RepoWorkspaceModel["adrHistory"] {
  return listFileTree(repoRoot)
    .filter((entry) => entry.kind === "file" && /(^|\/)ADR-[^/]+\.md$/i.test(entry.path))
    .map((entry) => {
      const content = readFileSync(join(repoRoot, entry.path), "utf8");
      return {
        path: entry.path,
        title: content.split("\n").find((line) => line.startsWith("#"))?.replace(/^#\s*/, "") ?? basename(entry.path),
        evidenceId: evidenceId("adr", entry.path)
      };
    })
    .slice(0, 20);
}

function buildDependencyGraph(repoRoot: string, fileTree: RepoWorkspaceModel["fileTree"]): RepoWorkspaceModel["dependencyGraph"] {
  const nodes: RepoWorkspaceModel["dependencyGraph"]["nodes"] = fileTree
    .filter((entry) => entry.kind === "file" && /\.(ts|tsx|js|jsx)$/.test(entry.path))
    .slice(0, 50)
    .map((entry) => ({ id: entry.path, kind: "source" as const }));

  const packageJsonPath = join(repoRoot, "package.json");
  if (existsSync(packageJsonPath)) {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { dependencies?: Record<string, string> };
    nodes.push(...Object.keys(pkg.dependencies ?? {}).map((id) => ({ id, kind: "package" as const })));
  }

  const sourceNodeIds = new Set(nodes.filter((node) => node.kind === "source").map((node) => node.id));
  const packageNodeIds = new Set(nodes.filter((node) => node.kind === "package").map((node) => node.id));
  const importEdges = nodes
    .filter((node) => node.kind === "source")
    .flatMap((node) => importsFromSourceFile(repoRoot, node.id).flatMap((specifier) => {
      const resolved = resolveImportSpecifier(node.id, specifier, sourceNodeIds, packageNodeIds);
      return resolved ? [{ from: node.id, to: resolved, kind: "imports" as const }] : [];
    }));

  return {
    nodes,
    edges: [
      ...nodes
      .filter((node) => node.kind === "source")
        .map((node) => ({ from: "repo", to: node.id, kind: "contains" as const })),
      ...importEdges
    ]
  };
}

function buildArchitectureGraph(fileTree: RepoWorkspaceModel["fileTree"]): RepoWorkspaceModel["architectureGraph"] {
  const topDirs = fileTree.filter((entry) => entry.kind === "directory" && !entry.path.includes("/")).slice(0, 12);
  return {
    nodes: [{ id: "repo", label: "Repository", kind: "root" }, ...topDirs.map((dir) => ({ id: dir.path, label: dir.path, kind: "directory" }))],
    edges: topDirs.map((dir) => ({ from: "repo", to: dir.path, label: "contains" }))
  };
}

function buildHotspots(diffText: string): RepoWorkspaceModel["codeHotspots"] {
  const currentFiles = new Map<string, number>();
  let current = "";
  for (const line of diffText.split("\n")) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      current = match[2];
      currentFiles.set(current, currentFiles.get(current) ?? 0);
      continue;
    }
    if (current && /^[+-]/.test(line) && !line.startsWith("+++") && !line.startsWith("---")) {
      currentFiles.set(current, (currentFiles.get(current) ?? 0) + 1);
    }
  }
  return [...currentFiles.entries()].map(([path, churn]) => ({ path, churn })).sort((a, b) => b.churn - a.churn);
}

function buildArchitectureBoundaries(fileTree: RepoWorkspaceModel["fileTree"]): RepoWorkspaceModel["architectureBoundaries"] {
  const counts = new Map<string, number>();
  for (const file of fileTree.filter((entry) => entry.kind === "file")) {
    const boundary = file.path.split("/")[0] ?? file.path;
    counts.set(boundary, (counts.get(boundary) ?? 0) + 1);
  }

  return [...counts.entries()].map(([pathPrefix, fileCount]) => ({
    id: `boundary:${pathPrefix}`,
    pathPrefix,
    kind: boundaryKind(pathPrefix),
    fileCount
  }));
}

function buildApiSurface(repoRoot: string, fileTree: RepoWorkspaceModel["fileTree"]): RepoWorkspaceModel["apiSurface"] {
  return fileTree
    .filter((entry) => entry.kind === "file" && /\.(ts|tsx|js|jsx)$/.test(entry.path))
    .flatMap((entry) => {
      const full = join(repoRoot, entry.path);
      if (!existsSync(full)) {
        return [];
      }
      return exportsFromSource(readFileSync(full, "utf8")).map((surface) => ({
        id: `api:${entry.path}:${surface.exportName}`,
        file: entry.path,
        exportName: surface.exportName,
        kind: surface.kind
      }));
    })
    .slice(0, 100);
}

function buildChangeImpact(
  hotspots: RepoWorkspaceModel["codeHotspots"],
  boundaries: RepoWorkspaceModel["architectureBoundaries"],
  apiSurface: RepoWorkspaceModel["apiSurface"]
): RepoWorkspaceModel["changeImpact"] {
  return hotspots.map((hotspot) => {
    const touchedBoundaries = boundaries
      .filter((boundary) => hotspot.path === boundary.pathPrefix || hotspot.path.startsWith(`${boundary.pathPrefix}/`))
      .map((boundary) => boundary.pathPrefix);
    const apiSurfaceIds = apiSurface
      .filter((surface) => surface.file === hotspot.path)
      .map((surface) => surface.id);

    return {
      evidenceId: evidenceId("change", hotspot.path),
      path: hotspot.path,
      churn: hotspot.churn,
      touchedBoundaries,
      apiSurfaceIds
    };
  });
}

function buildEvidenceIndex(input: {
  selectedFiles: RepoWorkspaceModel["selectedFiles"];
  adrHistory: RepoWorkspaceModel["adrHistory"];
  dependencyGraph: RepoWorkspaceModel["dependencyGraph"];
  apiSurface: RepoWorkspaceModel["apiSurface"];
  changeImpact: RepoWorkspaceModel["changeImpact"];
}): RepoWorkspaceModel["evidenceIndex"] {
  return [
    ...input.selectedFiles.map((file) => ({
      id: file.evidenceId,
      type: "file" as const,
      path: file.path,
      summary: `${file.lineCount} selected lines available for review`
    })),
    ...input.adrHistory.map((adr) => ({
      id: adr.evidenceId,
      type: "adr" as const,
      path: adr.path,
      summary: adr.title
    })),
    ...input.dependencyGraph.edges
      .filter((edge) => edge.kind === "imports")
      .map((edge) => ({
        id: `dep:${edge.from}->${edge.to}`,
        type: "dependency" as const,
        summary: `${edge.from} imports ${edge.to}`
      })),
    ...input.apiSurface.map((surface) => ({
      id: surface.id,
      type: "api_surface" as const,
      path: surface.file,
      summary: `${surface.kind} export ${surface.exportName}`
    })),
    ...input.changeImpact.map((impact) => ({
      id: impact.evidenceId,
      type: "change" as const,
      path: impact.path,
      summary: `${impact.churn} changed lines across ${impact.touchedBoundaries.join(", ") || "unknown boundary"}`
    }))
  ].slice(0, 250);
}

function importsFromSourceFile(repoRoot: string, path: string): string[] {
  const full = join(repoRoot, path);
  if (!existsSync(full)) {
    return [];
  }

  const content = readFileSync(full, "utf8");
  const imports = [
    ...content.matchAll(/import\s+(?:type\s+)?(?:[^'"]+\s+from\s+)?["']([^"']+)["']/g),
    ...content.matchAll(/export\s+[^'"]+\s+from\s+["']([^"']+)["']/g),
    ...content.matchAll(/require\(["']([^"']+)["']\)/g)
  ].map((match) => match[1]);

  return [...new Set(imports)];
}

function resolveImportSpecifier(
  sourcePath: string,
  specifier: string,
  sourceNodeIds: Set<string>,
  packageNodeIds: Set<string>
): string | undefined {
  if (specifier.startsWith(".")) {
    const baseParts = sourcePath.split("/").slice(0, -1);
    const normalized = normalizePath([...baseParts, specifier].join("/"));
    const candidates = [
      normalized,
      `${normalized}.ts`,
      `${normalized}.tsx`,
      `${normalized}.js`,
      `${normalized}.jsx`,
      `${normalized}/index.ts`,
      `${normalized}/index.tsx`
    ];
    return candidates.find((candidate) => sourceNodeIds.has(candidate));
  }

  const packageName = specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];
  return packageNodeIds.has(packageName) ? packageName : undefined;
}

function exportsFromSource(content: string): Array<{ exportName: string; kind: RepoWorkspaceModel["apiSurface"][number]["kind"] }> {
  const surfaces: Array<{ exportName: string; kind: RepoWorkspaceModel["apiSurface"][number]["kind"] }> = [];
  const patterns: Array<[RegExp, RepoWorkspaceModel["apiSurface"][number]["kind"]]> = [
    [/export\s+const\s+([A-Za-z0-9_$]+)/g, "const"],
    [/export\s+function\s+([A-Za-z0-9_$]+)/g, "function"],
    [/export\s+class\s+([A-Za-z0-9_$]+)/g, "class"],
    [/export\s+type\s+([A-Za-z0-9_$]+)/g, "type"],
    [/export\s+interface\s+([A-Za-z0-9_$]+)/g, "interface"]
  ];

  for (const [pattern, kind] of patterns) {
    for (const match of content.matchAll(pattern)) {
      surfaces.push({ exportName: match[1], kind });
    }
  }

  if (/export\s+default\b/.test(content)) {
    surfaces.push({ exportName: "default", kind: "default" });
  }

  for (const match of content.matchAll(/export\s+\{([^}]+)\}/g)) {
    for (const name of match[1].split(",").map((item) => item.trim().split(/\s+as\s+/i).at(-1)?.trim()).filter(isNonEmptyString)) {
      surfaces.push({ exportName: name, kind: "named" });
    }
  }

  return surfaces;
}

function boundaryKind(pathPrefix: string): RepoWorkspaceModel["architectureBoundaries"][number]["kind"] {
  if (/server|api/.test(pathPrefix)) return "server";
  if (/src|app|components/.test(pathPrefix)) return "frontend";
  if (/docs|adr/i.test(pathPrefix)) return "docs";
  if (/test|spec|__tests__/.test(pathPrefix)) return "tests";
  if (/config|scripts|github/.test(pathPrefix)) return "config";
  return "other";
}

function evidenceId(kind: "file" | "adr" | "change", path: string): string {
  return `${kind}:${normalizePath(path)}`;
}

function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      segments.pop();
      continue;
    }
    segments.push(part);
  }
  return segments.join("/");
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.length > 0;
}

function inferTestStatus(output: string | undefined): "passed" | "failed" | "unknown" {
  if (!output) {
    return "unknown";
  }
  if (/failed|error/i.test(output)) {
    return "failed";
  }
  if (/passed|success/i.test(output)) {
    return "passed";
  }
  return "unknown";
}
