import type { DecisionApiResponse } from "../lib/api-client";

type Locale = "en" | "zh";
type ProviderStatus = DecisionApiResponse["providerStatus"];

export function ProviderPolicyStatusPanel({
  locale,
  providerStatus
}: {
  locale: Locale;
  providerStatus?: ProviderStatus;
}) {
  const providers = Object.values(providerStatus ?? {}).filter((provider) => provider.implemented);
  const copy = providerPolicyCopy[locale];

  if (providers.length === 0) {
    return <p className="field-help">{copy.empty}</p>;
  }

  return (
    <div className="provider-policy-panel">
      <strong>{copy.title}</strong>
      <div className="provider-policy-list">
        {providers.slice(0, 6).map((provider) => {
          const denied = provider.configured && provider.policy?.effect === "deny";
          const allowed = provider.policy?.effect !== "deny";

          return (
            <article key={provider.id} className={denied ? "policy-denied" : ""}>
              <span>{provider.displayName}</span>
              <strong>{denied ? copy.configuredDenied : allowed ? copy.allowed : copy.unmatched}</strong>
              <small>
                {copy.model}: {provider.model}
              </small>
              <small>{provider.policy?.reason ?? copy.defaultAllow}</small>
            </article>
          );
        })}
      </div>
    </div>
  );
}

const providerPolicyCopy = {
  en: {
    title: "Provider policy",
    empty: "Provider policy status appears after the API health check.",
    configuredDenied: "configured but denied",
    allowed: "allowed",
    unmatched: "default allow",
    model: "model",
    rule: "rule",
    defaultAllow: "No provider policy matched; provider can participate if configured."
  },
  zh: {
    title: "Provider policy",
    empty: "API 健康检查后会显示 provider policy 状态。",
    configuredDenied: "已配置但被 policy 拒绝",
    allowed: "允许参与",
    unmatched: "默认允许",
    model: "模型",
    rule: "规则",
    defaultAllow: "没有匹配 policy；如果已配置则可以参与。"
  }
};
