import type { Env } from "./providers/registry";

const defaultAllowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
  "http://localhost:5175",
  "http://127.0.0.1:5175",
  "http://localhost:4173",
  "http://127.0.0.1:4173"
]);

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

export type ApiSecurityPolicy = {
  authenticationRequired: boolean;
  allowedOrigins: string[];
  rateLimit: {
    windowMs: number;
    maxRequests: number;
  };
  maxBodyBytes: number;
  hstsEnabled: boolean;
};

export function securityPolicyForEnv(env: Env): ApiSecurityPolicy {
  return {
    authenticationRequired: Boolean(env.QUORUMMIND_API_TOKEN),
    allowedOrigins: parseAllowedOrigins(env),
    rateLimit: {
      windowMs: positiveInteger(env.QUORUMMIND_RATE_LIMIT_WINDOW_MS, 60_000),
      maxRequests: positiveInteger(env.QUORUMMIND_RATE_LIMIT_MAX, 60)
    },
    maxBodyBytes: positiveInteger(env.QUORUMMIND_MAX_BODY_BYTES, 256 * 1024),
    hstsEnabled: env.QUORUMMIND_ENABLE_HSTS === "1"
  };
}

export function applySecurityHeaders(headers: Headers, request: Request, env: Env): Headers {
  const policy = securityPolicyForEnv(env);
  const origin = request.headers.get("Origin");
  const allowedOrigin = origin && policy.allowedOrigins.includes(origin) ? origin : undefined;

  if (allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Credentials", "false");
  }

  headers.set("Vary", appendVary(headers.get("Vary"), "Origin"));
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-QuorumMind-Token");
  headers.set("Access-Control-Max-Age", "600");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  headers.set("Cache-Control", "no-store");

  if (policy.hstsEnabled) {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return headers;
}

export function validateCors(request: Request, env: Env): Response | null {
  const origin = request.headers.get("Origin");

  if (!origin) {
    return null;
  }

  const policy = securityPolicyForEnv(env);

  if (policy.allowedOrigins.includes(origin)) {
    return null;
  }

  return secureJson(request, env, { error: "Origin is not allowed." }, 403);
}

export function validateApiToken(request: Request, env: Env): Response | null {
  const expectedToken = env.QUORUMMIND_API_TOKEN;

  if (!expectedToken) {
    return null;
  }

  const bearerToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  const token = request.headers.get("X-QuorumMind-Token") ?? bearerToken;

  if (token && timingSafeEqual(token, expectedToken)) {
    return null;
  }

  return secureJson(request, env, { error: "API token is required." }, 401, {
    "WWW-Authenticate": 'Bearer realm="QuorumMind API"'
  });
}

export function validateRateLimit(request: Request, env: Env): Response | null {
  const policy = securityPolicyForEnv(env);
  const clientId = clientIdentifier(request);
  const now = Date.now();
  const current = rateLimitBuckets.get(clientId);
  const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + policy.rateLimit.windowMs };

  bucket.count += 1;
  rateLimitBuckets.set(clientId, bucket);

  if (bucket.count <= policy.rateLimit.maxRequests) {
    return null;
  }

  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));

  return secureJson(request, env, { error: "Rate limit exceeded." }, 429, {
    "Retry-After": String(retryAfter),
    "X-RateLimit-Limit": String(policy.rateLimit.maxRequests),
    "X-RateLimit-Remaining": "0"
  });
}

export function secureJson(
  request: Request,
  env: Env,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  const headers = applySecurityHeaders(
    new Headers({
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders
    }),
    request,
    env
  );

  return new Response(JSON.stringify(body), { status, headers });
}

export function apiSecurityPosture(env: Env) {
  const policy = securityPolicyForEnv(env);

  return {
    classification: "local-first API",
    endpoints: [
      { method: "GET", path: "/api/health", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" },
      { method: "GET", path: "/api/security", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" },
      { method: "GET", path: "/api/rooms", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" },
      { method: "GET", path: "/api/rooms/:id", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" },
      { method: "POST", path: "/api/decisions", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" },
      { method: "POST", path: "/api/blueprints", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" },
      { method: "POST", path: "/api/agent-runs/blueprint", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" },
      { method: "POST", path: "/api/exports/pdf", documented: true, authentication: policy.authenticationRequired ? "required" : "optional" }
    ],
    controls: {
      securityHeaders: true,
      corsAllowlist: true,
      wildcardCors: false,
      rateLimiting: true,
      maxBodyBytes: policy.maxBodyBytes,
      authenticationRequired: policy.authenticationRequired,
      hstsEnabled: policy.hstsEnabled
    },
    policy
  };
}

function parseAllowedOrigins(env: Env): string[] {
  const configured = env.QUORUMMIND_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean);

  return configured && configured.length > 0 ? configured : Array.from(defaultAllowedOrigins);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function appendVary(existing: string | null, value: string): string {
  if (!existing) {
    return value;
  }

  const values = new Set(existing.split(",").map((item) => item.trim()).filter(Boolean));
  values.add(value);
  return Array.from(values).join(", ");
}

function clientIdentifier(request: Request): string {
  return (
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ||
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("Fly-Client-IP") ||
    "local"
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;

  for (let index = 0; index < length; index += 1) {
    diff |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }

  return diff === 0;
}
