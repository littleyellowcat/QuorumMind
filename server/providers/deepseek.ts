import { assertOkResponse, buildSystemPrompt, buildUserPrompt, readJsonResponse, requireApiKey } from "./prompt";
import type { ModelProvider, ProviderConfig, ProviderRequest } from "./types";

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function createDeepSeekProvider(config: ProviderConfig): ModelProvider {
  requireApiKey(config.apiKey, "DeepSeek");
  const fetchImpl = config.fetch ?? fetch;

  return {
    id: "deepseek",
    model: config.model,
    async generateDecisionText(request: ProviderRequest) {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
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
          temperature: 0.2,
          response_format: { type: "json_object" }
        })
      });
      const body = (await readJsonResponse(response)) as DeepSeekResponse;
      assertOkResponse(response, "DeepSeek", body);

      return body.choices?.[0]?.message?.content ?? JSON.stringify(body);
    }
  };
}
