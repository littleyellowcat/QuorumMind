import { assertOkResponse, buildSystemPrompt, buildUserPrompt, readJsonResponse, requireApiKey } from "./prompt";
import type { GatewayProviderConfig, ModelProvider, ProviderRequest } from "./types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

export function createModelGatewayProvider(config: GatewayProviderConfig): ModelProvider {
  requireApiKey(config.apiKey, "Model Gateway");
  const fetchImpl = config.fetch ?? fetch;
  const endpoint = modelGatewayEndpoint(config.baseUrl);

  return {
    id: config.providerId ?? "model_gateway",
    model: config.model,
    async generateDecisionText(request: ProviderRequest) {
      const response = await fetchImpl(endpoint, {
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
          temperature: 0.2
        })
      });
      const body = (await readJsonResponse(response)) as ChatCompletionResponse;
      assertOkResponse(response, "Model Gateway", body);

      const content = body.choices?.[0]?.message?.content;

      if (content) {
        return content;
      }

      if (isRawTextBody(body)) {
        throw new Error(
          "Model Gateway returned a non-JSON response. Check MODEL_GATEWAY_BASE_URL; expected an OpenAI-compatible /v1 endpoint."
        );
      }

      return JSON.stringify(body);
    }
  };
}

export function modelGatewayEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");

  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/v1/chat/completions`;
}

function isRawTextBody(body: unknown): body is { rawText: string } {
  return typeof body === "object" && body !== null && typeof (body as { rawText?: unknown }).rawText === "string";
}
