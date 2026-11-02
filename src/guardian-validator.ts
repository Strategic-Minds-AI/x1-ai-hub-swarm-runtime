export type GuardianCheckStatus = "PASS" | "FAIL" | "BLOCKED" | "UNKNOWN";
export type GuardianOverallStatus = GuardianCheckStatus;

export interface GuardianCheck {
  id: string;
  status: GuardianCheckStatus;
  required: boolean;
  evidence?: string[];
  detail?: string;
}

export interface GuardianValidationInput {
  executorIdentity: string;
  validatorIdentity: string;
  checks: GuardianCheck[];
}

export interface GuardianValidationResult {
  status: GuardianOverallStatus;
  score: number;
  requiredChecks: number;
  passedRequiredChecks: number;
  failures: string[];
  blocked: string[];
  unknown: string[];
}

function hasEvidence(check: GuardianCheck): boolean {
  return Array.isArray(check.evidence) && check.evidence.some((item) => item.trim().length > 0);
}

export function validateGuardian(input: GuardianValidationInput): GuardianValidationResult {
  const failures: string[] = [];
  const blocked: string[] = [];
  const unknown: string[] = [];

  if (!input.executorIdentity.trim() || !input.validatorIdentity.trim()) {
    unknown.push("validator_identity_missing");
  } else if (input.executorIdentity.trim() === input.validatorIdentity.trim()) {
    failures.push("validator_not_independent");
  }

  const required = input.checks.filter((check) => check.required);
  let passedRequiredChecks = 0;

  for (const check of required) {
    if (check.status === "PASS") {
      if (!hasEvidence(check)) unknown.push(check.id);
      else passedRequiredChecks += 1;
      continue;
    }
    if (check.status === "FAIL") failures.push(check.id);
    else if (check.status === "BLOCKED") blocked.push(check.id);
    else unknown.push(check.id);
  }

  const requiredChecks = required.length;
  const score = requiredChecks === 0
    ? 0
    : Math.round((passedRequiredChecks / requiredChecks) * 100);

  let status: GuardianOverallStatus = "PASS";
  if (failures.length > 0) status = "FAIL";
  else if (blocked.length > 0) status = "BLOCKED";
  else if (unknown.length > 0 || requiredChecks === 0) status = "UNKNOWN";

  return {
    status,
    score,
    requiredChecks,
    passedRequiredChecks,
    failures: [...new Set(failures)],
    blocked: [...new Set(blocked)],
    unknown: [...new Set(unknown)],
  };
}
