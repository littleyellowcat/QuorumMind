// @vitest-environment node
import { describe, expect, it } from "vitest";
import { evaluateProviderPolicy, parseProviderPolicy } from "./provider-policy";

describe("provider policy", () => {
  it("applies ordered allow and deny statements with wildcard resources", () => {
    const policy = parseProviderPolicy(JSON.stringify([
      { effect: "deny", action: "provider.use", resource: "*" },
      { effect: "allow", action: "provider.use", resource: "openai" },
      { effect: "deny", action: "provider.use", resource: "openai:gpt-4o-mini" }
    ]));

    expect(evaluateProviderPolicy(policy, "openai", "gpt-4o").effect).toBe("allow");
    expect(evaluateProviderPolicy(policy, "openai", "gpt-4o-mini")).toMatchObject({
      effect: "deny",
      matchedResource: "openai:gpt-4o-mini"
    });
    expect(evaluateProviderPolicy(policy, "gemini", "gemini-2.0-flash-lite").effect).toBe("deny");
  });

  it("keeps malformed policy input from disabling configured providers", () => {
    const policy = parseProviderPolicy("not json");

    expect(policy.issues).toContain("Policy must be valid JSON.");
    expect(evaluateProviderPolicy(policy, "openai", "gpt-4o-mini").effect).toBe("allow");
  });
});
