import { DatabaseSync } from "node:sqlite";
import type { AutonomousConsensusIteration, AutonomousAgentTraceEntry, AutonomousToolCall } from "./agent-platform/autonomous-blueprint";
import type { LiveDecisionTraceEntry } from "./live-decision";

// ── Constants ──────────────────────────────────────────────────

/** Compression threshold: 65% of the context window. */
export const COMPRESSION_THRESHOLD = 0.65;

/** Keyst the last N consensus rounds as tail messages when compressing. */
export const TAIL_ROUNDS = 3;

/** Default context window in tokens (128k, roughly GPT-4 class). */
export const DEFAULT_MAX_TOKENS = 128_000;

// ── Token estimation ───────────────────────────────────────────

/**
 * Roughly estimate token count from a text string.
 * Assumes ~3.5 characters per token (English-heavy text).
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/**
 * Estimate token count from a raw character count.
 * Internal helper — use estimateTokenCount for string inputs.
 */
export function estimateTokenCountFromChars(charCount: number): number {
  return Math.ceil(charCount / 3.5);
}

/**
 * Estimate token count from the full Blueprint state.
 * Extracts all textual content from accumulated arrays and string fields,
 * then applies the char/token heuristic.
 */
export function estimateStateTokenCount(state: {
  question?: string;
  trace?: AutonomousAgentTraceEntry[];
  toolCalls?: AutonomousToolCall[];
  consensusLoop?: AutonomousConsensusIteration[];
  providerTrace?: LiveDecisionTraceEntry[];
  contextSummary?: string;
}): number {
  const messages = extractStateMessages(state);
  const totalChars = messages.reduce((sum, m) => sum + m.length, 0);
  return estimateTokenCountFromChars(totalChars);
}

// ── Constraint extraction ─────────────────────────────────────

const HARD_CONSTRAINT_PATTERNS: RegExp[] = [
  // English patterns
  /not\s+accept.*?(?:above|over|exceed|more\s+than)/gi,
  /must\s+(?:complete|finish|deliver|deploy).*?(?:by|before|within)/gi,
  /cannot\s+(?:exceed|use|rely|depend|go\s+over)/gi,
  /P99\s*<\s*\d+/g,
  /latency\s*<\s*\d+/g,

  // Chinese patterns
  /不接受.*(?:超过|高于|大于)/g,
  /必须.*(?:之前|以内|完成|交付)/g,
  /不能.*(?:超过|使用|依赖|大于|高于)/g,
  /不得超过/g,
  /不得使用/g,
  /不得依赖/g,
  /延迟.*<\s*\d+/g,
];

/**
 * Extract hard constraints from a list of message strings.
 * Uses regex patterns that match both English and Chinese constraints.
 * Returns up to 10 unique constraints.
 */
export function extractConstraints(messages: string[]): string[] {
  const constraints: string[] = [];
  for (const msg of messages) {
    for (const pattern of HARD_CONSTRAINT_PATTERNS) {
      // Reset lastIndex for global regexps
      pattern.lastIndex = 0;
      const matches = msg.match(pattern);
      if (matches) constraints.push(...matches);
    }
  }
  return [...new Set(constraints)].slice(0, 10);
}

// ── Message extraction ────────────────────────────────────────

/**
 * Extract all textual message strings from the Blueprint state.
 * These strings are used for token estimation and constraint extraction.
 */
function extractStateMessages(state: {
  question?: string;
  trace?: AutonomousAgentTraceEntry[];
  toolCalls?: AutonomousToolCall[];
  consensusLoop?: AutonomousConsensusIteration[];
  providerTrace?: LiveDecisionTraceEntry[];
  contextSummary?: string;
}): string[] {
  const messages: string[] = [];

  if (state.question) {
    messages.push(state.question);
  }

  if (state.contextSummary) {
    messages.push(state.contextSummary);
  }

  for (const entry of state.trace ?? []) {
    messages.push(entry.summary);
    for (const e of entry.evidence) {
      messages.push(e);
    }
  }

  for (const entry of state.toolCalls ?? []) {
    messages.push(entry.inputSummary, entry.outputSummary);
  }

  for (const entry of state.consensusLoop ?? []) {
    messages.push(entry.summary);
    for (const imp of entry.improvements) {
      messages.push(imp);
    }
    for (const dis of entry.remainingDisagreements) {
      messages.push(dis);
    }
  }

  for (const entry of state.providerTrace ?? []) {
    if (entry.text) messages.push(entry.text);
  }

  return messages;
}

// ── Compression decision ──────────────────────────────────────

/**
 * Determine whether compression should be triggered.
 * @param stateMessages - extracted text messages from the state
 * @param maxTokens - the context window size in tokens
 */
export function shouldCompress(stateMessages: string[], maxTokens: number): boolean {
  const totalChars = stateMessages.reduce((sum, m) => sum + m.length, 0);
  const estimatedTokens = estimateTokenCountFromChars(totalChars);
  return estimatedTokens / maxTokens >= COMPRESSION_THRESHOLD;
}

// ── Context summary builder ───────────────────────────────────

/**
 * Build a compressed context summary from the state.
 * Summarizes all accumulated history into a single concise string,
 * keeping only the most critical information.
 */
export function buildContextSummary(state: {
  question?: string;
  trace?: AutonomousAgentTraceEntry[];
  toolCalls?: AutonomousToolCall[];
  consensusLoop?: AutonomousConsensusIteration[];
  providerTrace?: LiveDecisionTraceEntry[];
}): string {
  const parts: string[] = [];

  // Core question
  if (state.question) {
    const shortQuestion = state.question.length > 200
      ? state.question.slice(0, 200) + "..."
      : state.question;
    parts.push(`Question: ${shortQuestion}`);
  }

  // Trace summary (node sequence + key outcomes)
  const traceHistory = state.trace ?? [];
  if (traceHistory.length > 0) {
    const nodeSequence = traceHistory.map((t) => t.node).join(" → ");
    const keyOutcomes = traceHistory
      .filter((t) => t.status === "needs_review")
      .map((t) => `- [REVIEW] ${t.node}: ${t.summary.slice(0, 120)}`);
    parts.push(`Graph path: ${nodeSequence}`);
    if (keyOutcomes.length > 0) {
      parts.push(`Open review items:\n${keyOutcomes.join("\n")}`);
    }
  }

  // Consensus round history (compressed)
  const consensusHistory = state.consensusLoop ?? [];
  if (consensusHistory.length > 0) {
    const roundScores = consensusHistory
      .map((c) => `R${c.round}: score=${c.consensusScore}/${c.threshold} ${c.passed ? "✓" : "✗"} (${c.action})`)
      .join(", ");
    parts.push(`Consensus rounds: ${roundScores}`);
  }

  // Tool call summary
  const toolCalls = state.toolCalls ?? [];
  if (toolCalls.length > 0) {
    const toolSummary = toolCalls
      .map((tc) => `${tc.node}/${tc.toolName}`)
      .join(", ");
    parts.push(`Tool calls: ${toolSummary}`);
  }

  return parts.join("\n");
}

// ── Compressed context assembly ───────────────────────────────

/**
 * Assemble a compressed context string from its parts.
 * Joins parts with `\n\n---\n\n` separators.
 */
export function assembleCompressedContext(
  systemPrompt: string,
  knowledgeInjection: string,
  summary: string | null,
  tailMessages: string[]
): string {
  const parts: string[] = [systemPrompt];
  if (knowledgeInjection) parts.push(knowledgeInjection);
  if (summary) parts.push(`[Context Summary]\n${summary}`);
  parts.push(...tailMessages);
  return parts.join("\n\n---\n\n");
}

/**
 * Extract human-readable tail messages from a CompressedStateSlice.
 * These messages provide continuity after the compressed summary when
 * passed to {@link assembleCompressedContext}.
 */
export function extractTailMessages(slice: CompressedStateSlice): string[] {
  const messages: string[] = [];

  for (const entry of slice.trace) {
    messages.push(`[trace:${entry.node}] ${entry.summary}`);
  }
  for (const entry of slice.consensusLoop) {
    messages.push(`[consensus:R${entry.round}] ${entry.summary}`);
  }
  for (const entry of slice.toolCalls) {
    messages.push(`[tool:${entry.toolName}] ${entry.outputSummary}`);
  }

  return messages;
}

// ── Compressed state slice ────────────────────────────────────

/**
 * A truncated snapshot of the accumulated state arrays after compression.
 * Only the last 2 entries of each array are kept for continuity;
 * the full history is replaced by the context summary.
 */
export type CompressedStateSlice = {
  trace: AutonomousAgentTraceEntry[];
  toolCalls: AutonomousToolCall[];
  consensusLoop: AutonomousConsensusIteration[];
  providerTrace: LiveDecisionTraceEntry[];
  contextSummary: string;
};

// ── Compression result ────────────────────────────────────────

export type CompressionResult = {
  didCompress: boolean;
  summary: string | null;
  constraints: string[];
  /** Fill ratio of the context window (0-1). */
  fillRatio: number;
  /**
   * Truncated state arrays (last 2 entries each) plus the context summary.
   * Only populated when didCompress is true. The caller should replace the
   * accumulated arrays with these truncated versions so subsequent rounds
   * see reduced context usage.
   */
  compressedSlice?: CompressedStateSlice;
};

// ── Main compression function ─────────────────────────────────

/**
 * Main compression function for the Blueprint state graph.
 * Checks whether the accumulated context exceeds the threshold,
 * and if so, builds a compressed summary with extracted constraints.
 *
 * @param state - the current Blueprint graph state
 * @param maxTokens - the context window size (defaults to 128k)
 * @returns CompressionResult with summary and constraints
 */
export function compressContext(
  state: {
    question?: string;
    trace?: AutonomousAgentTraceEntry[];
    toolCalls?: AutonomousToolCall[];
    consensusLoop?: AutonomousConsensusIteration[];
    providerTrace?: LiveDecisionTraceEntry[];
    contextSummary?: string;
  },
  maxTokens: number = DEFAULT_MAX_TOKENS
): CompressionResult {
  const messages = extractStateMessages(state);
  const totalChars = messages.reduce((sum, m) => sum + m.length, 0);
  const estimatedTokens = estimateTokenCountFromChars(totalChars);
  const fillRatio = estimatedTokens / maxTokens;

  if (fillRatio < COMPRESSION_THRESHOLD) {
    return { didCompress: false, summary: null, constraints: [], fillRatio };
  }

  const constraints = extractConstraints(messages);
  const summary = buildContextSummary(state);

  // Build truncated state slice: keep only the last 2 entries per array
  // for continuity. The full history is represented by the summary.
  const compressedSlice: CompressedStateSlice = {
    trace: (state.trace ?? []).slice(-2),
    toolCalls: (state.toolCalls ?? []).slice(-2),
    consensusLoop: (state.consensusLoop ?? []).slice(-2),
    providerTrace: (state.providerTrace ?? []).slice(-2),
    contextSummary: summary,
  };

  return { didCompress: true, summary, constraints, fillRatio, compressedSlice };
}

// ── Pressure logging ──────────────────────────────────────────

/**
 * Log a pressure event to the pressure_log table.
 * This is a no-op if `db` is not provided (e.g., when using MemorySaver).
 */
export function logPressure(
  threadId: string,
  fillRatio: number,
  action: "none" | "compressed" | "emergency",
  db?: DatabaseSync
): void {
  if (!db) return;

  try {
    db.prepare(
      `INSERT INTO pressure_log (thread_id, fill_ratio, action) VALUES (?, ?, ?)`
    ).run(threadId, fillRatio, action);
  } catch {
    // Table may not exist yet; pressure logging is best-effort.
  }
}

// ── Helper: persist a context summary to the DB ───────────────

/**
 * Persist a compressed context summary to the context_summaries table.
 * This is a no-op if `db` is not provided.
 */
export function persistContextSummary(
  threadId: string,
  roundNumber: number,
  summaryType: "incremental" | "consolidated",
  content: string,
  tokenCountBefore: number,
  tokenCountAfter: number,
  db?: DatabaseSync
): void {
  if (!db) return;

  const id = `ctx-sum-${threadId}-r${roundNumber}-${Date.now().toString(36)}`;
  const compressedAt = new Date().toISOString();

  try {
    db.prepare(
      `INSERT INTO context_summaries (id, thread_id, round_number, summary_type, content, compressed_at, token_count_before, token_count_after)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, threadId, roundNumber, summaryType, content, compressedAt, tokenCountBefore, tokenCountAfter);
  } catch {
    // Best-effort persistence; table may not exist.
  }
}
