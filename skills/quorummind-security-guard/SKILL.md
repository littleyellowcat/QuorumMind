---
name: quorummind-security-guard
description: QuorumMind security guard for API token checks, CORS, rate limits, request-size limits, provider-key handling, export safety, logs, and local/self-use versus public-use hardening. Use for安全策略,API配置,CORS错误,限流,token,日志脱敏,or preparing the app for others.
---

<!-- quorummind-skill
domain: all
roles: [all]
triggers: [安全, CORS, token, API key, 限流, 请求体, 脱敏, 日志, security, auth, rate limit, export]
inject: both
-->

# QuorumMind Security Guard

## Baseline

1. Require API token protection for non-local or shared deployments.
2. Keep CORS allowlists explicit; do not silently allow arbitrary origins.
3. Apply rate limits and request-size limits to decision, blueprint, export, and provider-test endpoints.
4. Never log full API keys, authorization headers, or raw provider secrets.
5. Mark live/fallback status without exposing provider credentials.
6. Sanitize exported HTML/PDF content and avoid embedding untrusted script.

## Review Questions

- Is this endpoint safe for localhost only, team use, or public use?
- Can a malicious prompt cause oversized output, leaked config, or unsafe export content?
- Are errors helpful without exposing secrets?
- Does the UI clearly explain API token, CORS, and provider configuration failures?
