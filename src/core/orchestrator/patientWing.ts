import type { Manifest } from "../modules/schema";
import { messagesFor } from "../messages";
import { EMERGENCY_COPY } from "../messages";
import { runSafety, type SafetyDeps } from "../safety/engine";
import { comparisonBlocked } from "../safety/gate";
import type { CheckInInput, RiskEvaluation } from "../types";
import type { AuditEventInput } from "../audit/types";

export interface AlertDraft {
  state: "URGENT" | "PROMPT_REVIEW" | "UNABLE_TO_ASSESS";
  /** Never "acknowledged" until a clinician actually acknowledges it. */
  status: "open";
  summary: string;
}

export interface PatientCheckInOutput {
  evaluation: RiskEvaluation;
  alert: AlertDraft | null;
  patient_view: {
    state: RiskEvaluation["state"];
    messages: string[];
    emergency: typeof EMERGENCY_COPY | null;
    clinician_alert_recorded: boolean;
    acknowledged: false;
    notes: string[];
  };
  comparison_allowed: boolean;
  audit: AuditEventInput[];
  source: "patient_wing_orchestrator";
}

/** Safety first: runs before any option comparison, LLM text or research processing. Returns typed output only. */
export async function processCheckIn(manifest: Manifest | null, checkin: CheckInInput, actor_id: string, deps: SafetyDeps = {}): Promise<PatientCheckInOutput> {
  const evaluation = await runSafety(manifest, checkin, deps);
  const state = evaluation.state;
  const alert: AlertDraft | null = state === "ROUTINE" ? null : { state, status: "open", summary: evaluation.rationale.join(" | ").slice(0, 400) };
  const messages = manifest ? messagesFor(manifest.patient_messages, evaluation.patient_message_ids) : messagesFor({}, evaluation.patient_message_ids);
  const audit: AuditEventInput[] = [
    { action: "checkin.submitted", outcome: "success", actor_id, actor_role: "patient", resource_type: "checkin", resource_id: checkin.id, module_id: checkin.module_id },
    { action: "rule.evaluated", outcome: evaluation.error ? "error" : "success", actor_id: "system", actor_role: "system", resource_type: "risk_evaluation", resource_id: evaluation.id, module_id: evaluation.module_id, module_version: evaluation.module_version, rule_ids: evaluation.triggered_rule_ids, details: { state, engine: evaluation.engine_version, missing: evaluation.missing_fields.length, conflicts: evaluation.contradictions.length } },
  ];
  if (alert) audit.push({ action: "alert.created", outcome: "success", actor_id: "system", actor_role: "system", resource_type: "alert", resource_id: evaluation.id, module_id: evaluation.module_id, module_version: evaluation.module_version, details: { state } });
  return {
    evaluation, alert,
    patient_view: {
      state, messages,
      emergency: state === "URGENT" ? EMERGENCY_COPY : null,
      clinician_alert_recorded: alert !== null,
      acknowledged: false,
      notes: [
        "Medication options and rankings are never shown to patients — only a clinician-signed plan.",
        ...(alert ? ["A clinician alert has been recorded. It is not monitored 24/7 and has not been acknowledged."] : []),
      ],
    },
    comparison_allowed: !comparisonBlocked(state),
    audit, source: "patient_wing_orchestrator",
  };
}
