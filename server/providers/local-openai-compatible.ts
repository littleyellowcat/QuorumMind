import { assertOkResponse, buildSystemPrompt, buildUserPrompt, readJsonResponse } from "./prompt";
import type { LocalOpenAICompatibleProviderConfig, ModelProvider, ProviderRequest } from "./types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function createOllamaProvider(config: LocalOpenAICompatibleProviderConfig): ModelProvider {
  return createLocalOpenAICompatibleProvider("ollama", "Ollama", config);
}

export function createLMStudioProvider(config: LocalOpenAICompatibleProviderConfig): ModelProvider {
  return createLocalOpenAICompatibleProvider("lmstudio", "LM Studio", config);
}

function createLocalOpenAICompatibleProvider(
  id: "ollama" | "lmstudio",
  displayName: string,
  config: LocalOpenAICompatibleProviderConfig
): ModelProvider {
  if (!config.baseUrl.trim()) {
    throw new Error(`${displayName} base URL is required`);
  }

  const fetchImpl = config.fetch ?? fetch;
  const endpoint = localChatCompletionsEndpoint(config.baseUrl);

  return {
    id,
    model: config.model,
    async generateDecisionText(request: ProviderRequest) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: "system",
              content: buildSystemPrompt(request)
            },
            {
              role: "user",
              content: buildUserPrompt(request)
            }
          ],
          temperature: 0.2
        })
      });
      const body = (await readJsonResponse(response)) as ChatCompletionResponse;
      assertOkResponse(response, displayName, body);

      return body.choices?.[0]?.message?.content ?? JSON.stringify(body);
    }
  };
}

export function localChatCompletionsEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");

  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
}
