import { z } from "zod";
import { CondSchema } from "./dsl";

const isoDate = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "date must be YYYY, YYYY-MM or YYYY-MM-DD");
const id = z.string().regex(/^[A-Za-z0-9_.\-]+$/);

export const GuidelineSourceSchema = z.object({
  id,
  title: z.string().min(3),
  publisher: z.string(),
  published: isoDate,
  jurisdiction: z.string().min(2),
  url: z.string().optional(),
  /** Internal re-review deadline. After this the source is treated as expired (T14). */
  review_by: isoDate,
  /** Prototype note: only id/title/date are referenced; no recommendation text is quoted. */
  note: z.string().optional(),
});

export const QuestionSchema = z.object({
  id,
  text: z.string().min(3),
  type: z.enum(["number", "boolean", "choice", "multi", "scale", "text"]),
  unit: z.string().optional(),
  allowed_units: z.array(z.string()).optional(),
  concept: z.string().optional(),
  choices: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().default(false),
  safety_critical: z.boolean().default(false),
  /** Safety-critical questions are never paraphrased by an LLM (F21). */
  help: z.string().optional(),
});

export const MeasureSchema = z.object({
  concept: id,
  label: z.string(),
  canonical_unit: z.string(),
  units: z.record(z.string(), z.number().positive()), // unit -> factor to canonical
  plausible_min: z.number(),
  plausible_max: z.number(),
});

export const DerivedSchema = z.object({
  id,
  label: z.string(),
  op: z.enum(["sum", "diff"]),
  of: z.array(z.string().regex(/^(answers|obs)\.[A-Za-z0-9_]+$/)).min(1),
});

export const RedFlagRuleSchema = z.object({
  id,
  label: z.string(),
  when: CondSchema,
  state: z.enum(["URGENT", "PROMPT_REVIEW"]),
  patient_message_id: id,
  rationale: z.string().min(5),
  demo_threshold: z.boolean().default(true),
});

export const EvidenceRefSchema = z.object({
  guideline_source_id: id,
  published: isoDate,
  reviewed: isoDate,
  jurisdiction: z.string().min(2),
  rationale: z.string().min(5),
  applicable_population: z.string().min(3),
});

export const OptionCardSchema = z.object({
  id,
  label: z.string(),
  option_type: z.enum(["drug_class", "non_drug"]).default("drug_class"),
  illustrative: z.boolean().default(true),
  evidence_category: z.number().int().min(1).max(5), // 1 = strongest illustrative category; used only for default sort
  indication_context: z.string(),
  why_relevant: z.string(),
  why_may_not_suit: z.string(),
  considerations: z.array(z.string()),
  requires_fields: z.array(id).default([]),
  hard_exclusions: z.array(z.object({ id, when: CondSchema, reason: z.string() })).default([]),
  cautions: z.array(z.object({ id, when: CondSchema, note: z.string() })).default([]),
  preference_effects: z.array(z.object({ preference: z.string(), effect: z.enum(["aligns", "conflicts"]), note: z.string() })).default([]),
  evidence: z.array(EvidenceRefSchema),
});

export const DrugGeneSchema = z.object({
  option_id: id,
  gene: z.string(),
  guideline_source_id: id,
  actionable_phenotypes: z.array(z.string()).min(1),
  statement: z.string(),
});

export const OutcomeSchema = z.object({
  id,
  label: z.string(),
  window_weeks: z.number().int().positive(),
  definition: z.string(),
});

export const ProfileFieldSchema = z.object({
  key: id,
  label: z.string(),
  critical: z.boolean().default(false),
  requires_verification: z.boolean().default(false),
  unit: z.string().optional(),
});

export const ManifestSchema = z.object({
  module_id: id,
  module_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  display_name: z.string(),
  condition_code: z.string(),
  population_scope: z.string(),
  clinical_approver: z.object({ name: z.string().min(2), role: z.string(), signed_off_at: isoDate, illustrative_placeholder: z.boolean().default(true) }),
  guideline_sources: z.array(GuidelineSourceSchema).min(1),
  last_evidence_review: isoDate,
  checkin_question_schema: z.array(QuestionSchema).min(1),
  required_profile_fields: z.array(ProfileFieldSchema),
  measure_definitions: z.array(MeasureSchema),
  derived_measures: z.array(DerivedSchema).default([]),
  consistency_rules: z.array(z.object({ id, when: CondSchema, message: z.string() })).default([]),
  red_flag_rules: z.array(RedFlagRuleSchema),
  free_text_keywords: z.array(z.object({ id, pattern: z.string().min(2), state: z.literal("PROMPT_REVIEW") })).default([]),
  patient_messages: z.record(z.string(), z.string()),
  treatment_option_cards: z.array(OptionCardSchema),
  interaction_coverage: z.array(z.string()).default([]),
  drug_gene_evidence: z.array(DrugGeneSchema).default([]),
  outcome_definitions: z.array(OutcomeSchema),
  trial_search_terms: z.array(z.string()),
  validation_case_ids: z.array(z.string()),
  effective_status: z.enum(["draft", "active", "retired"]),
  illustrative_content_notice: z.string().default("Illustrative content — pending clinical review"),
});

export type Manifest = z.infer<typeof ManifestSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type OptionCard = z.infer<typeof OptionCardSchema>;
export type RedFlagRule = z.infer<typeof RedFlagRuleSchema>;
export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;
export type GuidelineSource = z.infer<typeof GuidelineSourceSchema>;
export type MeasureDef = z.infer<typeof MeasureSchema>;
