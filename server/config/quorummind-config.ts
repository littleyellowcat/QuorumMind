import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const mcpServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({})
});

const customToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().default(""),
  inputSchema: z.record(z.string(), z.unknown()).default({})
});

const providerOverrideSchema = z.object({
  enabled: z.boolean().default(true),
  model: z.string().optional(),
  baseUrl: z.string().optional()
});

const quorummindConfigSchema = z.object({
  mcpServers: z.record(z.string(), mcpServerSchema).default({}),
  customTools: z.array(customToolSchema).default([]),
  agents: z.record(z.string(), z.object({
    tools: z.array(z.string()).default([])
  })).default({}),
  providers: z.record(z.string(), providerOverrideSchema).default({})
});

export type QuorumMindConfig = z.infer<typeof quorummindConfigSchema> & {
  loaded: boolean;
  path?: string;
  errors: string[];
};

export type QuorumMindConfigSummary = {
  loaded: boolean;
  path?: string;
  errors: string[];
  mcpServers: Array<{
    name: string;
    command: string;
    configuredEnvKeys: string[];
  }>;
  customTools: Array<{
    name: string;
    description: string;
  }>;
  agentToolAccess: Array<{
    agentId: string;
    tools: string[];
  }>;
  providerOverrides: Array<{
    providerId: string;
    enabled: boolean;
    model?: string;
    baseUrlConfigured: boolean;
  }>;
};

export function loadQuorumMindConfig(rootDir = process.cwd()): QuorumMindConfig {
  const path = join(rootDir, "quorummind.config.json");

  if (!existsSync(path)) {
    return emptyConfig(false, path);
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    const parsed = quorummindConfigSchema.safeParse(raw);

    if (!parsed.success) {
      return {
        ...emptyConfig(true, path),
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      };
    }

    return {
      ...parsed.data,
      loaded: true,
      path,
      errors: []
    };
  } catch (error) {
    return {
      ...emptyConfig(true, path),
      errors: [error instanceof Error ? error.message : "Unable to parse quorummind.config.json."]
    };
  }
}

export function summarizeQuorumMindConfig(config: QuorumMindConfig): QuorumMindConfigSummary {
  return {
    loaded: config.loaded,
    ...(config.path ? { path: config.path } : {}),
    errors: config.errors,
    mcpServers: Object.entries(config.mcpServers).map(([name, server]) => ({
      name,
      command: server.command,
      configuredEnvKeys: Object.keys(server.env).sort()
    })),
    customTools: config.customTools.map((tool) => ({
      name: tool.name,
      description: tool.description
    })),
    agentToolAccess: Object.entries(config.agents).map(([agentId, agent]) => ({
      agentId,
      tools: agent.tools
    })),
    providerOverrides: Object.entries(config.providers).map(([providerId, provider]) => ({
      providerId,
      enabled: provider.enabled,
      ...(provider.model ? { model: provider.model } : {}),
      baseUrlConfigured: Boolean(provider.baseUrl)
    }))
  };
}

function emptyConfig(loaded: boolean, path?: string): QuorumMindConfig {
  return {
    loaded,
    ...(path ? { path } : {}),
    errors: [],
    mcpServers: {},
    customTools: [],
    agents: {},
    providers: {}
  };
}
