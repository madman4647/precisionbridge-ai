import type { ComparisonResult } from "@/core/options/pipeline";
import type { CheckInInput, Profile, RiskEvaluation, SafetyState } from "@/core/types";
import type { CohortDefinition, CohortSummary } from "@/core/research/cohort";
import type { HypothesisCandidate } from "@/core/hypotheses/builder";
import type { Manifest } from "@/core/modules/schema";

export interface PatientRecord {
  id: string; display_name: string; module_id: string; condition_code: string; clinician_id: string; age_band: string; sex_at_birth: "F" | "M";
  profile: Profile; scenarios: string[];
}
export interface ConsentRecord { id: string; patient_id: string; kind: "clinical" | "research"; granted: boolean; at: string; changed_by: string; note?: string }
export type CheckInRecord = CheckInInput;
export interface AlertRecord {
  id: string; patient_id: string; checkin_id: string; evaluation_id: string; state: "URGENT" | "PROMPT_REVIEW" | "UNABLE_TO_ASSESS"; status: "open" | "acknowledged";
  summary: string; created_at: string; acknowledged_by?: string; acknowledged_at?: string; disposition?: string;
}
export interface ComparisonRecord {
  id: string; patient_id: string; evaluation_id: string; checkin_id: string; review_state: "draft" | "signed" | "rejected"; result: ComparisonResult; created_by: string; created_at: string;
}
export type DecisionAction = "approve_plan" | "request_more_data" | "reject_candidate" | "record_alternative" | "mark_alert_reviewed" | "refer_to_human_service" | "reorder_options";
export interface DecisionRecord {
  id: string; patient_id: string; comparison_id: string | null; action: DecisionAction; rationale: string; signed_by: string; signed_by_name: string; signed_at: string;
  selected_option_ids: string[]; patient_instruction?: string; option_order?: string[]; alert_id?: string; module_id: string; module_version: string; evidence_version: string; plan_version?: number;
}
export interface PlanItem { type: "medication_class" | "follow_up_action" | "referral" | "info"; text: string }
export interface CarePlanRecord {
  id: string; patient_id: string; version: number; items: PlanItem[]; decision_id: string | null; signed_by: string; signed_at: string; reason: string; supersedes: number | null; module_id: string; module_version: string;
}
export interface FollowUpRecord { id: string; patient_id: string; plan_version: number; created_at: string; response: "better" | "same" | "worse" | "not_started"; side_effects: string[]; severity: "none" | "mild" | "moderate" | "severe"; note: string; reviewed: boolean }
export interface ModuleVersionRecord { id: string; module_id: string; version: string; status: "draft" | "active" | "retired"; created_at: string; manifest: Manifest; warnings: string[] }
export interface CohortRecord { id: string; name: string; definition: CohortDefinition; hash: string; created_by: string; created_at: string; last_summary_hash?: string }
export interface HypothesisRecord { id: string; cohort_hash: string; candidate: HypothesisCandidate; status: "queued" | "dismissed" | "needs_evidence" | "scientific_review_requested" | "not_promoted"; reviewer?: string; reviewed_at?: string; note?: string }

export type { RiskEvaluation, SafetyState, CohortSummary };
