export type QuorumMindGithubCommandName = "decide" | "blueprint" | "review-pr";

export type QuorumMindGithubCommand =
  | {
      matched: true;
      source: "github_comment";
      trigger: "/quorummind" | "/qm";
      command: QuorumMindGithubCommandName;
      prompt: string;
      prNumber?: number;
    }
  | {
      matched: false;
    };

const triggerPattern = /^\/(quorummind|qm)\b/i;
const validCommands = new Set<QuorumMindGithubCommandName>(["decide", "blueprint", "review-pr"]);

export function parseQuorumMindGithubCommand(commentBody: string): QuorumMindGithubCommand {
  const trimmed = commentBody.trim();
  const triggerMatch = trimmed.match(triggerPattern);

  if (!triggerMatch) {
    return { matched: false };
  }

  const trigger = triggerMatch[0].toLowerCase() as "/quorummind" | "/qm";
  const rest = trimmed.slice(triggerMatch[0].length).trim();
  const [maybeCommand, ...tokens] = rest.split(/\s+/);
  const command = maybeCommand as QuorumMindGithubCommandName | undefined;

  if (!command || !validCommands.has(command)) {
    return { matched: false };
  }

  const parsed = parsePromptAndPrNumber(tokens);

  if (command === "review-pr" && (parsed.invalidPrFlag || !parsed.prNumber || !parsed.prompt)) {
    return { matched: false };
  }

  return {
    matched: true,
    source: "github_comment",
    trigger,
    command,
    prompt: parsed.prompt,
    ...(parsed.prNumber ? { prNumber: parsed.prNumber } : {})
  };
}

function parsePromptAndPrNumber(tokens: string[]): { prompt: string; prNumber?: number; invalidPrFlag: boolean } {
  const promptTokens: string[] = [];
  let prNumber: number | undefined;
  let invalidPrFlag = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if ((token === "--pr" || token === "--pull-request") && tokens[index + 1]) {
      const candidate = Number.parseInt(tokens[index + 1], 10);
      if (Number.isFinite(candidate) && candidate > 0) {
        prNumber = candidate;
      } else {
        invalidPrFlag = true;
      }
      index += 1;
      continue;
    }

    promptTokens.push(token);
  }

  return {
    prompt: promptTokens.join(" ").trim(),
    prNumber,
    invalidPrFlag
  };
}
