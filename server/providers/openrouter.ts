import { assertOkResponse, buildSystemPrompt, buildUserPrompt, readJsonResponse, requireApiKey } from "./prompt";
import type { ModelProvider, ProviderConfig, ProviderRequest } from "./types";

type OpenRouterResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function createOpenRouterProvider(config: ProviderConfig): ModelProvider {
  requireApiKey(config.apiKey, "OpenRouter");
  const fetchImpl = config.fetch ?? fetch;

  return {
    id: "openrouter",
    model: config.model,
    async generateDecisionText(request: ProviderRequest) {
      const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "QuorumMind"
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
      const body = (await readJsonResponse(response)) as OpenRouterResponse;
      assertOkResponse(response, "OpenRouter", body);

      return body.choices?.[0]?.message?.content ?? JSON.stringify(body);
    }
  };
}
