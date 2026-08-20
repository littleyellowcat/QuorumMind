export type FailureCategory =
  | "timeout"
  | "rate_limit"
  | "provider_error"
  | "safety_rejected"
  | "json_parse_error"
  | "schema_validation_error"
  | "missing_reference"
  | "qa_failed"
  | "permission_denied"
  | "unknown";

export type FailureRetryability = "retryable" | "repairable" | "human_action_required" | "terminal";
export type FailureSeverity = "info" | "warning" | "error";

export type FailureClassification = {
  category: FailureCategory;
  retryability: FailureRetryability;
  severity: FailureSeverity;
  message: string;
  providerStatus?: number;
};

export type ClassifyFailureOptions = {
  fallbackCategory?: FailureCategory;
};

export function classifyFailure(error: unknown, options: ClassifyFailureOptions = {}): FailureClassification {
  const message = failureMessage(error);
  const lower = message.toLowerCase();
  const providerStatus = statusCodeFor(error);
  const category = categoryFor(lower, providerStatus, options.fallbackCategory);

  return {
    category,
    retryability: retryabilityFor(category),
    severity: severityFor(category),
    message: message || category,
    ...(providerStatus ? { providerStatus } : {})
  };
}

function categoryFor(
  lowerMessage: string,
  providerStatus: number | undefined,
  fallbackCategory: FailureCategory | undefined
): FailureCategory {
  if (providerStatus === 429 || /\b429\b|rate limit|too many requests|quota/.test(lowerMessage)) {
    return "rate_limit";
  }

  if (providerStatus === 408 || /timeout|timed out|deadline|abort/.test(lowerMessage)) {
    return "timeout";
  }

  if (/safety|safe completion|content policy|policy rejected|refusal|refused|blocked by provider/.test(lowerMessage)) {
    return "safety_rejected";
  }

  if (/missing reference|reference asset|missing asset|not found reference/.test(lowerMessage)) {
    return "missing_reference";
  }

  if (/\bqa\b|quality gate|visual qa|validation failed by qa/.test(lowerMessage)) {
    return "qa_failed";
  }

  if (/permission|not allowed|forbidden|unauthorized/.test(lowerMessage)) {
    return "permission_denied";
  }

  if (fallbackCategory) {
    return fallbackCategory;
  }

  if (providerStatus && providerStatus >= 500) {
    return "provider_error";
  }

  if (/provider|upstream|model service|server error|500|502|503|504/.test(lowerMessage)) {
    return "provider_error";
  }

  return "unknown";
}

function retryabilityFor(category: FailureCategory): FailureRetryability {
  if (category === "timeout" || category === "rate_limit" || category === "provider_error") {
    return "retryable";
  }

  if (category === "json_parse_error" || category === "schema_validation_error") {
    return "repairable";
  }

  if (category === "missing_reference" || category === "qa_failed" || category === "permission_denied") {
    return "human_action_required";
  }

  return "terminal";
}

function severityFor(category: FailureCategory): FailureSeverity {
  if (category === "safety_rejected" || category === "permission_denied") {
    return "error";
  }

  if (category === "unknown") {
    return "error";
  }

  return "warning";
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (isRecord(error)) {
    const message = error.message ?? error.error ?? error.statusText;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Unknown failure";
}

function statusCodeFor(error: unknown): number | undefined {
  if (!isRecord(error)) {
    return undefined;
  }

  const status = error.status ?? error.statusCode ?? error.code;
  const numeric = typeof status === "number" ? status : typeof status === "string" ? Number(status) : NaN;

  return Number.isInteger(numeric) ? numeric : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
