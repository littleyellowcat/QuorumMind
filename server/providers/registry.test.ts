// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createConfiguredProviders, getProviderStatus } from "./registry";

describe("provider registry", () => {
  it("reports the unified model gateway as configured only when key and base URL are present", () => {
    expect(getProviderStatus({ MODEL_GATEWAY_API_KEY: "key" }).model_gateway.configured).toBe(false);
    expect(
      getProviderStatus({
        MODEL_GATEWAY_API_KEY: "key",
        MODEL_GATEWAY_BASE_URL: "https://gateway.example.com/v1"
      }).model_gateway.configured
    ).toBe(true);
  });

  it("creates one gateway provider per configured model seat", () => {
    const providers = createConfiguredProviders({
      MODEL_GATEWAY_API_KEY: "key",
      MODEL_GATEWAY_BASE_URL: "https://gateway.example.com/v1",
      MODEL_GATEWAY_MODELS: "gpt-4o-mini, deepseek-chat, gemini-2.0-flash-lite"
    });

    expect(providers.map((provider) => provider.model)).toEqual([
      "gpt-4o-mini",
      "deepseek-chat",
      "gemini-2.0-flash-lite"
    ]);
    expect(providers.map((provider) => provider.id)).toEqual(["openai", "deepseek", "gemini"]);
  });

  it("uses DeepSeek key and base URL as a gateway alias for early unified testing", () => {
    const env = {
      DEEPSEEK_API_KEY: "key",
      DEEPSEEK_BASE_URL: "https://gateway.example.com/v1",
      MODEL_GATEWAY_GPT_MODEL: "gpt-4o-mini",
      MODEL_GATEWAY_DEEPSEEK_MODEL: "deepseek-chat",
      MODEL_GATEWAY_GEMINI_MODEL: "gemini-2.0-flash-lite"
    };

    expect(getProviderStatus(env).model_gateway.configured).toBe(true);
    expect(getProviderStatus(env).model_gateway.model).toBe("gpt-4o-mini,deepseek-chat,gemini-2.0-flash-lite");

    const providers = createConfiguredProviders(env);

    expect(providers.map((provider) => provider.model)).toEqual([
      "gpt-4o-mini",
      "deepseek-chat",
      "gemini-2.0-flash-lite"
    ]);
    expect(providers.map((provider) => provider.id)).toEqual(["openai", "deepseek", "gemini"]);
  });

  it("filters disabled gateway model seats without mutating configured model status", () => {
    const providers = createConfiguredProviders({
      MODEL_GATEWAY_API_KEY: "key",
      MODEL_GATEWAY_BASE_URL: "https://gateway.example.com/v1",
      MODEL_GATEWAY_MODELS: "gpt-5.4-mini, deepseek-v4-pro, gemini-3.1-pro-preview",
      QUORUMMIND_DISABLED_LIVE_MODELS: "gpt-5.4-mini,gemini:gemini-3.1-pro-preview"
    });

    expect(providers.map((provider) => `${provider.id}:${provider.model}`)).toEqual(["deepseek:deepseek-v4-pro"]);
    expect(
      getProviderStatus({
        MODEL_GATEWAY_API_KEY: "key",
        MODEL_GATEWAY_BASE_URL: "https://gateway.example.com/v1",
        MODEL_GATEWAY_MODELS: "gpt-5.4-mini, deepseek-v4-pro, gemini-3.1-pro-preview",
        QUORUMMIND_DISABLED_LIVE_MODELS: "gpt-5.4-mini,gemini:gemini-3.1-pro-preview"
      }).model_gateway.model
    ).toBe("gpt-5.4-mini, deepseek-v4-pro, gemini-3.1-pro-preview");
  });

  it("filters disabled standalone providers without skipping later configured providers", () => {
    const providers = createConfiguredProviders({
      OPENAI_API_KEY: "openai-key",
      OPENAI_MODEL: "gpt-4o-mini",
      DEEPSEEK_API_KEY: "deepseek-key",
      DEEPSEEK_MODEL: "deepseek-chat",
      GEMINI_API_KEY: "gemini-key",
      GEMINI_MODEL: "gemini-2.0-flash-lite",
      QUORUMMIND_DISABLED_LIVE_MODELS: "openai:gpt-4o-mini,deepseek-chat"
    });

    expect(providers.map((provider) => `${provider.id}:${provider.model}`)).toEqual(["gemini:gemini-2.0-flash-lite"]);
  });
});
