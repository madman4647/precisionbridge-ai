import { ManifestSchema, type Manifest } from "./schema";
import { condDepth, condFields } from "./dsl";
import { DEFAULT_PATIENT_MESSAGES } from "../messages";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  manifest?: Manifest;
}

/** ISO partial date -> comparable ms (end of period for partial dates is not needed; start is fine). */
export function parseDate(d: string): number {
  const parts = d.split("-").map(Number);
  return Date.UTC(parts[0], (parts[1] ?? 1) - 1, parts[2] ?? 1);
}

export const MAX_COND_DEPTH = 8;
export const MAX_EVIDENCE_AGE_MONTHS = 36;

export function monthsBetween(aMs: number, bMs: number): number {
  return (bMs - aMs) / (1000 * 60 * 60 * 24 * 30.4375);
}

export function isSourceExpired(reviewBy: string, now: Date): boolean {
  return parseDate(reviewBy) < now.getTime();
}

/** Schema + safety validation. Rejected modules cannot be activated (T18). */
export function validateManifest(input: unknown, now: Date = new Date()): ValidationResult {
  const parsed = ManifestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`), warnings: [] };
  }
  const m = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!m.clinical_approver.name.trim()) errors.push("clinical_approver: missing signed reviewer");
  if (m.clinical_approver.illustrative_placeholder) warnings.push("clinical_approver is an illustrative placeholder — no qualified clinician has signed off");

  const reviewMs = parseDate(m.last_evidence_review);
  if (monthsBetween(reviewMs, now.getTime()) > MAX_EVIDENCE_AGE_MONTHS) errors.push(`last_evidence_review ${m.last_evidence_review} is older than ${MAX_EVIDENCE_AGE_MONTHS} months (expired evidence)`);
  const sourceIds = new Set(m.guideline_sources.map((s) => s.id));
  if (sourceIds.size !== m.guideline_sources.length) errors.push("guideline_sources: duplicate ids");
  for (const s of m.guideline_sources) if (isSourceExpired(s.review_by, now)) errors.push(`guideline source ${s.id} review_by ${s.review_by} has passed (expired evidence)`);

  const qIds = new Set(m.checkin_question_schema.map((q) => q.id));
  if (qIds.size !== m.checkin_question_schema.length) errors.push("checkin_question_schema: duplicate question ids");
  const concepts = new Set(m.measure_definitions.map((d) => d.concept));
  for (const q of m.checkin_question_schema) {
    if (q.concept && !concepts.has(q.concept)) errors.push(`question ${q.id}: concept ${q.concept} has no measure_definition`);
    if ((q.type === "choice" || q.type === "multi") && !q.choices?.length) errors.push(`question ${q.id}: choices required`);
  }

  const derivedIds = new Set(m.derived_measures.map((d) => d.id));
  const checkField = (where: string, f: string) => {
    const [ns, key] = f.split(".");
    if (ns === "answers" && !qIds.has(key)) errors.push(`${where}: unknown answer field ${f}`);
    if (ns === "obs" && !concepts.has(key)) errors.push(`${where}: unknown observation concept ${f}`);
    if (ns === "derived" && !derivedIds.has(key)) errors.push(`${where}: unknown derived measure ${f}`);
  };
  for (const d of m.derived_measures) d.of.forEach((f) => checkField(`derived ${d.id}`, f));

  const ruleIds = new Set<string>();
  for (const r of m.red_flag_rules) {
    if (ruleIds.has(r.id)) errors.push(`red_flag_rules: duplicate id ${r.id}`);
    ruleIds.add(r.id);
    if (condDepth(r.when) > MAX_COND_DEPTH) errors.push(`rule ${r.id}: condition too deep`);
    condFields(r.when).forEach((f) => checkField(`rule ${r.id}`, f));
    if (!(r.patient_message_id in m.patient_messages) && !(r.patient_message_id in DEFAULT_PATIENT_MESSAGES)) errors.push(`rule ${r.id}: patient_message_id ${r.patient_message_id} not defined`);
  }
  for (const c of m.consistency_rules) condFields(c.when).forEach((f) => checkField(`consistency ${c.id}`, f));
  if (!m.red_flag_rules.some((r) => r.state === "URGENT")) warnings.push("module defines no URGENT rule");

  const profileKeys = new Set(m.required_profile_fields.map((p) => p.key));
  profileKeys.add("allergy_status");
  const cardIds = new Set<string>();
  for (const c of m.treatment_option_cards) {
    if (cardIds.has(c.id)) errors.push(`option card duplicate id ${c.id}`);
    cardIds.add(c.id);
    for (const rf of c.requires_fields) if (!profileKeys.has(rf)) errors.push(`option ${c.id}: requires_fields ${rf} not in required_profile_fields`);
    for (const x of [...c.hard_exclusions.map((e) => e.when), ...c.cautions.map((e) => e.when)]) {
      if (condDepth(x) > MAX_COND_DEPTH) errors.push(`option ${c.id}: condition too deep`);
      condFields(x).forEach((f) => { if (!f.startsWith("profile.")) errors.push(`option ${c.id}: option conditions may only read profile.* (${f})`); });
    }
    if (c.evidence.length === 0) warnings.push(`option ${c.id}: no evidence — card will be withheld`);
    for (const e of c.evidence) if (!sourceIds.has(e.guideline_source_id)) warnings.push(`option ${c.id}: evidence cites unknown source ${e.guideline_source_id} — card will be withheld`);
  }
  for (const g of m.drug_gene_evidence) {
    if (!cardIds.has(g.option_id)) errors.push(`drug_gene_evidence: unknown option ${g.option_id}`);
    if (!sourceIds.has(g.guideline_source_id)) errors.push(`drug_gene_evidence: unknown source ${g.guideline_source_id}`);
  }
  for (const k of m.free_text_keywords) {
    try { new RegExp(k.pattern, "i"); } catch { errors.push(`free_text_keywords ${k.id}: invalid pattern`); }
  }
  return { ok: errors.length === 0, errors, warnings, manifest: errors.length === 0 ? m : undefined };
}
