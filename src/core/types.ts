export const WATERMARK = "SYNTHETIC DATA — NOT FOR CLINICAL USE";

export const SAFETY_STATES = ["URGENT", "PROMPT_REVIEW", "ROUTINE", "UNABLE_TO_ASSESS"] as const;
export type SafetyState = (typeof SAFETY_STATES)[number];

export type Role = "patient" | "clinician" | "researcher" | "safety_admin";

export type NullReason = "not_asked" | "unknown" | "not_available" | "not_applicable";
export type DatumSource = "patient" | "clinician" | "lab" | "synthetic";
export type Verification = "verified" | "unverified" | "conflicting";

/** Every profile datum carries provenance. Missing is never imputed as normal. */
export interface Datum<T = string | number | boolean> {
  value: T | null;
  unit?: string;
  observed_at: string | null;
  source: DatumSource;
  verification_status: Verification;
  null_reason?: NullReason;
}

export interface AllergyItem {
  substance: string;
  class_tag: string;
  reaction: string;
  verification_status: Verification;
}

export interface MedicationItem {
  name: string;
  class_tag: string;
  start_date: string;
  status: "active" | "stopped";
  stop_date?: string;
  intolerance?: string;
}

export interface GenotypeReport {
  report_id: string;
  gene: string;
  phenotype: string;
  status: "valid" | "indeterminate" | "outdated";
  reported_at: string;
  expires_at: string | null;
  lab: string;
}

export interface Profile {
  fields: Record<string, Datum>;
  allergy_status: "none_known" | "listed" | "unknown";
  allergies: AllergyItem[];
  medications: MedicationItem[];
  conditions: { code: string; label: string; tag: string; verification_status: Verification }[];
  preferences: string[];
  genotype_reports: GenotypeReport[];
}

export type AnswerValue = string | number | boolean | string[] | null;

export interface Observation {
  concept: string;
  value: number;
  unit: string;
  observed_at: string;
  verification_status: Verification;
  excluded?: boolean;
  exclusion_reason?: string;
}

export interface CheckInInput {
  id: string;
  patient_id: string;
  module_id: string;
  created_at: string;
  source: "patient" | "synthetic";
  answers: Record<string, AnswerValue>;
  units: Record<string, string>;
  free_text: string;
  observed_at?: string;
}

export interface RiskEvaluation {
  id: string;
  checkin_id: string;
  module_id: string;
  module_version: string;
  engine_version: string;
  state: SafetyState;
  triggered_rule_ids: string[];
  missing_fields: string[];
  contradictions: string[];
  data_quality_issues: string[];
  patient_message_ids: string[];
  rationale: string[];
  observations: Observation[];
  evaluated_at: string;
  error?: string;
  source: "deterministic_rules_engine";
  limitations: string[];
}

export const ENGINE_VERSION = "rules-engine/1.0.0";
