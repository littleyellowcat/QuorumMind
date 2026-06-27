import { assertOkResponse, buildSystemPrompt, buildUserPrompt, readJsonResponse, requireApiKey } from "./prompt";
import type { ModelProvider, ProviderConfig, ProviderRequest } from "./types";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      text?: string;
      type?: string;
    }>;
  }>;
};

export function createOpenAIProvider(config: ProviderConfig): ModelProvider {
  requireApiKey(config.apiKey, "OpenAI");
  const fetchImpl = config.fetch ?? fetch;

  return {
    id: "openai",
    model: config.model,
    async generateDecisionText(request: ProviderRequest) {
      const response = await fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: config.model,
          input: [
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
      const body = (await readJsonResponse(response)) as OpenAIResponse;
      assertOkResponse(response, "OpenAI", body);

      return extractOpenAIText(body);
    }
  };
}

function extractOpenAIText(body: OpenAIResponse): string {
  if (body.output_text) {
    return body.output_text;
  }

  const contentText = body.output?.flatMap((item) => item.content ?? []).find((content) => content.text)?.text;

  if (contentText) {
    return contentText;
  }

  return JSON.stringify(body);
}
