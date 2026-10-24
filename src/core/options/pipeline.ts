import type { Manifest, OptionCard, EvidenceRef } from "../modules/schema";
import { evalCond, type Resolved } from "../modules/dsl";
import { isSourceExpired, monthsBetween, parseDate, MAX_EVIDENCE_AGE_MONTHS } from "../modules/validator";
import { evaluatePgx, type PgxResult } from "../pgx/applicability";
import { comparisonBlocked } from "../safety/gate";
import type { Profile, SafetyState } from "../types";

export type OptionStatus = "eligible_for_review" | "requires_manual_review" | "excluded_by_rule";

export interface EvidenceView extends EvidenceRef {
  source_title: string;
  source_publisher: string;
  module_id: string;
  module_version: string;
}

export interface OptionCardView {
  option_id: string;
  label: string;
  option_type: string;
  illustrative: boolean;
  status: OptionStatus;
  status_reasons: string[];
  why_relevant: string;
  why_may_not_suit: string;
  indication_context: string;
  considerations: string[];
  cautions: string[];
  exclusion_reasons: string[];
  missing_checks: string[];
  coverage_warnings: string[];
  preference_notes: { preference: string; effect: "aligns" | "conflicts"; note: string }[];
  pgx: PgxResult;
  evidence: EvidenceView[];
  evidence_category: number;
}

export interface MissingField { key: string; label: string; reason: "missing" | "unverified" }

export interface ComparisonResult {
  module_id: string;
  module_version: string;
  evidence_version: string;
  heading: "Potential options to consider";
  safety_state: SafetyState | null;
  blocked: boolean;
  blocked_reason?: string;
  personalized_ranking: boolean;
  ranking_note?: string;
  missing_fields: MissingField[];
  cards: OptionCardView[];
  withheld: { option_id: string; label: string; message: string }[];
  limitations: string[];
  created_at: string;
  source: "option_comparison_service";
}

const LIMITS = [
  "Clinician-facing only; not an instruction to prescribe. No doses or success probabilities are generated.",
  "Option content is illustrative and pending clinical review.",
  "Interaction coverage is limited to curated classes; absence of a warning is not a safety claim.",
];

export function buildProfileResolver(profile: Profile): (path: string) => Resolved {
  const f = profile.fields;
  const allergyVerified = f.allergy_status?.verification_status === "verified";
  const arrVerified = (items: { verification_status: string }[]) => items.every((i) => i.verification_status === "verified");
  return (path) => {
    const key = path.split(".")[1];
    switch (key) {
      case "allergy_status": return { value: profile.allergy_status, verified: allergyVerified };
      case "allergy_classes":
        return profile.allergy_status === "unknown" ? { value: null, verified: false } : { value: profile.allergies.map((a) => a.class_tag), verified: allergyVerified && arrVerified(profile.allergies) };
      case "active_med_classes": return { value: profile.medications.filter((m) => m.status === "active").map((m) => m.class_tag), verified: true };
      case "condition_tags": return { value: profile.conditions.map((c) => c.tag), verified: arrVerified(profile.conditions) };
      case "preferences": return { value: profile.preferences, verified: true };
      default: {
        const d = f[key];
        if (!d) return { value: null, verified: false };
        if (d.value === null) return d.null_reason === "not_applicable" ? { value: "not_applicable", verified: true } : { value: null, verified: false };
        return { value: d.value, verified: d.verification_status === "verified" };
      }
    }
  };
}

function fieldProblem(profile: Profile, key: string, requiresVerification: boolean): MissingField["reason"] | null {
  if (key === "allergy_status") {
    if (profile.allergy_status === "unknown") return "missing";
    return profile.fields.allergy_status?.verification_status === "verified" ? null : "unverified";
  }
  const d = profile.fields[key];
  if (!d || (d.value === null && d.null_reason !== "not_applicable")) return "missing";
  if (d.value !== null && requiresVerification && d.verification_status !== "verified") return "unverified";
  return null;
}

/** Evidence validity (T14): every card needs ≥1 citation to a present, unexpired source in this module version. */
export function validEvidence(manifest: Manifest, card: OptionCard, now: Date): EvidenceView[] {
  if (monthsBetween(parseDate(manifest.last_evidence_review), now.getTime()) > MAX_EVIDENCE_AGE_MONTHS) return [];
  const out: EvidenceView[] = [];
  for (const e of card.evidence) {
    const src = manifest.guideline_sources.find((s) => s.id === e.guideline_source_id);
    if (!src || isSourceExpired(src.review_by, now)) continue;
    out.push({ ...e, source_title: src.title, source_publisher: src.publisher, module_id: manifest.module_id, module_version: manifest.module_version });
  }
  return out;
}

export interface ComparisonInput {
  manifest: Manifest;
  safety_state: SafetyState | null;
  profile: Profile;
  now?: Date;
}

/** PRD §8.4 pipeline. All disease behaviour comes from the manifest. */
export function buildComparison({ manifest, safety_state, profile, now = new Date() }: ComparisonInput): ComparisonResult {
  const base = {
    module_id: manifest.module_id,
    module_version: manifest.module_version,
    evidence_version: `${manifest.module_id}@${manifest.module_version}`,
    heading: "Potential options to consider" as const,
    safety_state,
    limitations: LIMITS,
    created_at: now.toISOString(),
    source: "option_comparison_service" as const,
  };
  if (comparisonBlocked(safety_state)) {
    return {
      ...base, blocked: true, personalized_ranking: false, missing_fields: [], cards: [], withheld: [],
      blocked_reason: safety_state === null ? "No safety evaluation exists — option comparison requires a completed safety check." : `Safety state ${safety_state}: option comparison is blocked. Human safety review comes first.`,
    };
  }

  const resolve = buildProfileResolver(profile);
  const missing: MissingField[] = [];
  for (const pf of manifest.required_profile_fields) {
    if (!pf.critical) continue;
    const p = fieldProblem(profile, pf.key, pf.requires_verification);
    if (p) missing.push({ key: pf.key, label: pf.label, reason: p });
  }
  const personalized = missing.length === 0;
  const activeClasses = profile.medications.filter((m) => m.status === "active").map((m) => m.class_tag);
  const uncovered = activeClasses.filter((c) => !manifest.interaction_coverage.includes(c));

  const cards: OptionCardView[] = [];
  const withheld: ComparisonResult["withheld"] = [];
  for (const card of manifest.treatment_option_cards) {
    const evidence = validEvidence(manifest, card, now);
    if (evidence.length === 0) {
      withheld.push({ option_id: card.id, label: card.label, message: "Insufficient evidence — manual review required." });
      continue;
    }
    const reasons: string[] = [];
    const exclusion_reasons: string[] = [];
    const cautions: string[] = [];
    const missing_checks: string[] = missing.map((m) => `${m.label} (${m.reason})`);
    let manual = missing.length > 0;
    let excluded = false;

    for (const key of card.requires_fields) {
      const def = manifest.required_profile_fields.find((p) => p.key === key);
      const p = fieldProblem(profile, key, def?.requires_verification ?? false);
      const label = def?.label ?? key;
      if (p && !missing.some((m) => m.key === key)) { missing_checks.push(`${label} (${p})`); manual = true; }
    }
    for (const ex of card.hard_exclusions) {
      const r = evalCond(ex.when, resolve);
      const allVerified = r.touched.filter((t) => t.present).every((t) => t.verified);
      if (r.result === "true" && allVerified) { excluded = true; exclusion_reasons.push(ex.reason); }
      else if (r.result === "true") { manual = true; reasons.push(`Possible exclusion on unverified data: ${ex.reason}`); }
      else if (r.result === "unknown") { manual = true; reasons.push(`Exclusion check could not be completed: ${ex.reason}`); }
    }
    for (const ca of card.cautions) {
      const r = evalCond(ca.when, resolve);
      if (r.result === "true") cautions.push(ca.note);
      else if (r.result === "unknown") { manual = true; reasons.push(`Caution check incomplete: ${ca.note}`); }
    }
    const coverage_warnings = uncovered.length
      ? [`Interaction coverage incomplete: no curated content for current medication class(es): ${uncovered.join(", ")}. This is not a safe-by-default finding.`]
      : [];
    if (coverage_warnings.length && !excluded) manual = true;

    const preference_notes = card.preference_effects.filter((p) => profile.preferences.includes(p.preference)).map((p) => ({ preference: p.preference, effect: p.effect, note: p.note }));
    const status: OptionStatus = excluded ? "excluded_by_rule" : manual ? "requires_manual_review" : "eligible_for_review";
    if (status === "requires_manual_review" && missing_checks.length) reasons.push("Required information is missing or unverified — no confident personalised ranking.");
    cards.push({
      option_id: card.id, label: card.label, option_type: card.option_type, illustrative: card.illustrative, status,
      status_reasons: reasons, why_relevant: card.why_relevant, why_may_not_suit: card.why_may_not_suit, indication_context: card.indication_context,
      considerations: card.considerations, cautions, exclusion_reasons, missing_checks, coverage_warnings, preference_notes,
      pgx: evaluatePgx(manifest, card.id, profile.genotype_reports, now), evidence, evidence_category: card.evidence_category,
    });
  }

  const rank = { eligible_for_review: 0, requires_manual_review: 1, excluded_by_rule: 2 };
  const prefScore = (c: OptionCardView) => c.preference_notes.reduce((s, n) => s + (n.effect === "aligns" ? -1 : 1), 0);
  cards.sort((a, b) =>
    personalized
      ? rank[a.status] - rank[b.status] || prefScore(a) - prefScore(b) || a.evidence_category - b.evidence_category || a.label.localeCompare(b.label)
      : rank[a.status] === 2 || rank[b.status] === 2 ? rank[a.status] - rank[b.status] : a.evidence_category - b.evidence_category || a.label.localeCompare(b.label),
  );

  return {
    ...base, blocked: false, personalized_ranking: personalized, missing_fields: missing, cards, withheld,
    ranking_note: personalized ? undefined : "Critical information is missing or unverified. Cards are shown in neutral evidence-category order only — no personalised ranking.",
  };
}
