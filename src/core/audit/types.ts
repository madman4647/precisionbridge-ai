import type { Role } from "../types";

export const AUDIT_ACTIONS = [
  "session.switch", "consent.changed", "profile.updated", "checkin.submitted", "rule.evaluated", "alert.created", "alert.acknowledged",
  "comparison.generated", "comparison.blocked", "decision.signed", "plan.version_created", "followup.submitted",
  "ai.output", "research.cohort_query", "research.cohort_saved", "research.record_excluded", "research.export", "hypothesis.generated", "hypothesis.reviewed",
  "trial.prescreen", "module.validated", "module.activated", "module.rolled_back", "module.rejected", "access.denied", "demo.reset", "fault_injection.changed", "export.generated",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEventInput {
  action: AuditAction;
  outcome: "success" | "denied" | "error";
  actor_id: string;
  actor_role: Role | "system";
  resource_type?: string;
  resource_id?: string;
  module_id?: string;
  module_version?: string;
  rule_ids?: string[];
  /** Must never contain direct identifiers or health free text. */
  details?: Record<string, unknown>;
  scenario_id?: string;
}

export interface AuditEvent extends AuditEventInput {
  id: string;
  ts: string;
  request_id: string;
}

export interface AuditWriter {
  write(e: AuditEventInput): Promise<void>;
}
