import { assertOkResponse, buildSystemPrompt, buildUserPrompt, readJsonResponse, requireApiKey } from "./prompt";
import type { ModelProvider, ProviderConfig, ProviderRequest } from "./types";

type AnthropicResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
};

export function createAnthropicProvider(config: ProviderConfig): ModelProvider {
  requireApiKey(config.apiKey, "Anthropic");
  const fetchImpl = config.fetch ?? fetch;

  return {
    id: "anthropic",
    model: config.model,
    async generateDecisionText(request: ProviderRequest) {
      const response = await fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1600,
          temperature: 0.2,
          system: buildSystemPrompt(request),
          messages: [
            {
              role: "user",
              content: buildUserPrompt(request)
            }
          ]
        })
      });
      const body = (await readJsonResponse(response)) as AnthropicResponse;
      assertOkResponse(response, "Anthropic", body);

      return body.content?.find((item) => item.type === "text" && item.text)?.text ?? JSON.stringify(body);
    }
  };
}
