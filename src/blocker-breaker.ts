export type BlockerCategory =
  | "AUTH_FAILURE"
  | "PERMISSION_FAILURE"
  | "CONNECTOR_FAILURE"
  | "NETWORK_FAILURE"
  | "LOCAL_MACHINE_OFFLINE"
  | "TOOL_UNAVAILABLE"
  | "PROVIDER_OUTAGE"
  | "RATE_LIMIT"
  | "RESOURCE_LIMIT"
  | "SOURCE_CONFLICT"
  | "DEPENDENCY_FAILURE"
  | "BUILD_FAILURE"
  | "TEST_FAILURE"
  | "DEPLOYMENT_FAILURE"
  | "SECRET_REFERENCE_FAILURE"
  | "PROTECTED_ACTION_REQUIRED"
  | "UNKNOWN";

export type BlockerDisposition =
  | "RETRY_TRANSIENT"
  | "TRY_ALTERNATE_ROUTE"
  | "REQUIRE_APPROVAL"
  | "DEAD_LETTER"
  | "CONTINUE_UNRELATED";

export interface BlockerDecisionInput {
  code: string;
  attempts: number;
  maxAttempts: number;
  alternateAvailable?: boolean;
  protectedAction?: boolean;
}

export interface BlockerDecision {
  category: BlockerCategory;
  disposition: BlockerDisposition;
  retryDelayMs: number | null;
  continueUnrelated: true;
  exhausted: boolean;
}

const RULES: Array<[RegExp, BlockerCategory]> = [
  [/AUTH|UNAUTHORIZED|TOKEN|CREDENTIAL/i, "AUTH_FAILURE"],
  [/PERMISSION|FORBIDDEN|DENIED/i, "PERMISSION_FAILURE"],
  [/CONNECTOR|MCP/i, "CONNECTOR_FAILURE"],
  [/NETWORK|ECONN|DNS|TLS|TIMEOUT/i, "NETWORK_FAILURE"],
  [/LOCAL_MACHINE_OFFLINE|JARVIS_OFFLINE|HOST_OFFLINE/i, "LOCAL_MACHINE_OFFLINE"],
  [/TOOL_UNAVAILABLE|COMMAND_NOT_FOUND|NOT_FOUND_TOOL/i, "TOOL_UNAVAILABLE"],
  [/PROVIDER_OUTAGE|SERVICE_UNAVAILABLE|HTTP_5\d\d/i, "PROVIDER_OUTAGE"],
  [/RATE_LIMIT|HTTP_429|TOO_MANY_REQUESTS/i, "RATE_LIMIT"],
  [/RESOURCE_LIMIT|OOM|CAPACITY|QUOTA/i, "RESOURCE_LIMIT"],
  [/SOURCE_CONFLICT|SHA_MISMATCH|DRIFT_CONFLICT/i, "SOURCE_CONFLICT"],
  [/DEPENDENCY|MODULE_NOT_FOUND|PACKAGE/i, "DEPENDENCY_FAILURE"],
  [/BUILD/i, "BUILD_FAILURE"],
  [/TEST|ASSERT/i, "TEST_FAILURE"],
  [/DEPLOY|RELEASE/i, "DEPLOYMENT_FAILURE"],
  [/SECRET_REFERENCE|SECRET_MISSING|ENV_REQUIRED/i, "SECRET_REFERENCE_FAILURE"],
  [/PROTECTED_ACTION|APPROVAL_REQUIRED/i, "PROTECTED_ACTION_REQUIRED"],
];

const TRANSIENT = new Set<BlockerCategory>([
  "NETWORK_FAILURE",
  "PROVIDER_OUTAGE",
  "RATE_LIMIT",
  "RESOURCE_LIMIT",
  "CONNECTOR_FAILURE",
  "LOCAL_MACHINE_OFFLINE",
]);

export function classifyBlocker(code: string): BlockerCategory {
  const normalized = code.trim();
  for (const [pattern, category] of RULES) {
    if (pattern.test(normalized)) return category;
  }
  return "UNKNOWN";
}

export function decideBlocker(input: BlockerDecisionInput): BlockerDecision {
  const attempts = Math.max(0, Math.trunc(input.attempts));
  const maxAttempts = Math.max(0, Math.trunc(input.maxAttempts));
  const category = input.protectedAction
    ? "PROTECTED_ACTION_REQUIRED"
    : classifyBlocker(input.code);
  const exhausted = attempts >= maxAttempts;

  if (category === "PROTECTED_ACTION_REQUIRED") {
    return {
      category,
      disposition: "REQUIRE_APPROVAL",
      retryDelayMs: null,
      continueUnrelated: true,
      exhausted,
    };
  }

  if (!exhausted && TRANSIENT.has(category)) {
    const exponent = Math.min(attempts, 6);
    return {
      category,
      disposition: "RETRY_TRANSIENT",
      retryDelayMs: Math.min(3_600_000, 60_000 * (2 ** exponent)),
      continueUnrelated: true,
      exhausted: false,
    };
  }

  if (input.alternateAvailable) {
    return {
      category,
      disposition: "TRY_ALTERNATE_ROUTE",
      retryDelayMs: null,
      continueUnrelated: true,
      exhausted,
    };
  }

  return {
    category,
    disposition: exhausted ? "DEAD_LETTER" : "CONTINUE_UNRELATED",
    retryDelayMs: null,
    continueUnrelated: true,
    exhausted,
  };
}
