import { assertOkResponse, buildSystemPrompt, buildUserPrompt, readJsonResponse, requireApiKey } from "./prompt";
import type { ModelProvider, ProviderConfig, ProviderRequest } from "./types";

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

export function createGeminiProvider(config: ProviderConfig): ModelProvider {
  requireApiKey(config.apiKey, "Gemini");
  const fetchImpl = config.fetch ?? fetch;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    config.model
  )}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  return {
    id: "gemini",
    model: config.model,
    async generateDecisionText(request: ProviderRequest) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildSystemPrompt(request) }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: buildUserPrompt(request) }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      });
      const body = (await readJsonResponse(response)) as GeminiResponse;
      assertOkResponse(response, "Gemini", body);

      return body.candidates?.[0]?.content?.parts?.find((part) => part.text)?.text ?? JSON.stringify(body);
    }
  };
}
