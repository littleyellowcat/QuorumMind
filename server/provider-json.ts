export function parseProviderJson(text: string): unknown {
  const normalized = text.trim();

  if (!normalized) {
    return undefined;
  }

  const direct = tryParseJson(normalized);

  if (direct !== undefined) {
    return direct;
  }

  for (const block of fencedJsonBlocks(normalized)) {
    const parsed = tryParseJson(block);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  for (const candidate of balancedJsonCandidates(normalized)) {
    const parsed = tryParseJson(candidate);

    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fencedJsonBlocks(text: string): string[] {
  const blocks: string[] = [];
  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(text)) !== null) {
    const block = match[1]?.trim();

    if (block) {
      blocks.push(block);
    }
  }

  return blocks;
}

function balancedJsonCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char !== "{" && char !== "[") {
      continue;
    }

    const candidate = balancedSliceFrom(text, index);

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function balancedSliceFrom(text: string, start: number): string | undefined {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = inString;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack.pop();

      if (expected !== char) {
        return undefined;
      }

      if (stack.length === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return undefined;
}
