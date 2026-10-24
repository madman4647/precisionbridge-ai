import seedrandom from "seedrandom";
import type { Manifest } from "@/core/modules/schema";
import type { AnswerValue, CheckInInput, Datum, GenotypeReport, MedicationItem, Profile } from "@/core/types";
import type { ResearchRecord, Severity } from "@/core/research/cohort";
import type { SafetyState } from "@/core/types";

export const SEED = "precisionbridge-demo-v1";
export const ANCHOR = new Date("2026-10-20T09:00:00.000Z");
const DAY = 86400000;

export type Kind = "routine" | "urgent" | "prompt" | "missing" | "unit" | "implausible" | "contradict";

export interface SyntheticPatient {
  id: string;
  display_name: string;
  module_id: string;
  condition_code: string;
  clinician_id: string;
  age_band: string;
  sex_at_birth: "F" | "M";
  profile: Profile;
  consent_clinical: boolean;
  consent_research: boolean;
  scenarios: string[];
  checkins: CheckInInput[];
  seeded_plans: { version: number; items: { type: "medication_class" | "follow_up_action" | "info"; text: string }[]; at: string; reason: string }[];
  research: ResearchRecord;
}

/** Expected labels are stored separately from app data (never in the DB) so known outcomes can't pose as discoveries. */
export interface ExpectedLabels { checkin_state: Record<string, SafetyState>; fixtures: Record<string, string[]> }

const EXPECTED_STATE: Record<Kind, Record<string, SafetyState>> = {
  routine: { _: "ROUTINE" }, urgent: { _: "URGENT" }, prompt: { _: "PROMPT_REVIEW" }, missing: { _: "UNABLE_TO_ASSESS" }, unit: { _: "UNABLE_TO_ASSESS" }, implausible: { _: "UNABLE_TO_ASSESS" },
  contradict: { _: "UNABLE_TO_ASSESS", depression: "URGENT" },
};

// Synthetic-data configuration (this file is seed tooling, not engine code).
const TYPICAL: Record<string, [number, number]> = { bp_systolic: [128, 8], bp_diastolic: [80, 5], glucose: [115, 25] };
const ROUTINE_CLAMP: Record<string, [number, number]> = { bp_systolic: [108, 148], bp_diastolic: [64, 92], glucose: [80, 180] }; // keeps "routine" journeys clear of every demo rule
const CLASS_WEIGHTS: Record<string, [string, number][]> = {
  hypertension: [["htn_acei_arb", 0.45], ["htn_ccb", 0.3], ["htn_thiazide", 0.18], ["htn_lifestyle", 0.07]],
  t2d: [["t2d_metformin", 0.4], ["t2d_sglt2", 0.28], ["t2d_glp1", 0.2], ["t2d_su", 0.12]],
  depression: [["dep_ssri", 0.5], ["dep_snri", 0.25], ["dep_ndri", 0.18], ["dep_psychotherapy", 0.07]],
};
const MED_CLASS: Record<string, Record<string, [string, string]>> = {
  hypertension: { htn_acei_arb: ["Synthetic-ACEi", "ace_inhibitor"], htn_ccb: ["Synthetic-CCB", "ccb"], htn_thiazide: ["Synthetic-Thiazide", "thiazide"], htn_lifestyle: ["Synthetic-ARB", "arb"] },
  t2d: { t2d_metformin: ["Synthetic-Biguanide", "biguanide"], t2d_sglt2: ["Synthetic-SGLT2i", "sglt2"], t2d_glp1: ["Synthetic-GLP1", "glp1"], t2d_su: ["Synthetic-SU", "sulfonylurea"] },
  depression: { dep_ssri: ["Synthetic-SSRI", "ssri"], dep_snri: ["Synthetic-SNRI", "snri"], dep_ndri: ["Synthetic-NDRI", "ndri"], dep_psychotherapy: ["Synthetic-SSRI", "ssri"] },
};
const BASE_RESPONSE: Record<string, number> = { hypertension: 0.62, t2d: 0.55, depression: 0.5 };
const ALLERGY_EXCL: Record<string, string> = { hypertension: "ace_inhibitor", t2d: "biguanide", depression: "ssri" };
const SCORE_RANGE: Record<string, [number, number, number, number]> = { // baseline_score ranges for mild/moderate/severe: [mildMax, modMax, min, max]
  hypertension: [150, 165, 138, 190], t2d: [7.5, 9, 6.5, 12], depression: [9, 19, 5, 27],
};
const PREFIX: Record<string, string> = { hypertension: "HTN", t2d: "DM", depression: "DEP" };
const AGE_BANDS = ["18-34", "35-54", "55-74"];

const iso = (d: Date) => d.toISOString();
const pad = (n: number) => String(n).padStart(3, "0");
const pickW = <T,>(rnd: () => number, opts: [T, number][]): T => { let r = rnd(), acc = 0; for (const [v, w] of opts) { acc += w; if (r < acc) return v; } return opts[opts.length - 1][0]; };
const gauss = (rnd: () => number, m: number, sd: number) => { const u = Math.max(rnd(), 1e-9), v = rnd(); return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

function datum(value: Datum["value"], over: Partial<Datum> = {}): Datum {
  return { value, observed_at: iso(new Date(ANCHOR.getTime() - 30 * DAY)), source: "lab", verification_status: "verified", ...over };
}

function routineAnswers(m: Manifest, rnd: () => number, k: number, n: number): { answers: Record<string, AnswerValue>; units: Record<string, string> } {
  const answers: Record<string, AnswerValue> = {};
  const units: Record<string, string> = {};
  for (const q of m.checkin_question_schema) {
    if (q.id === "free_text") continue;
    if (q.type === "boolean") answers[q.id] = false;
    else if (q.concept) {
      const [mu, sd] = TYPICAL[q.concept] ?? [100, 10];
      const drift = (n - k) * 0.4; // gentle improving trend
      if (q.required || rnd() < 0.75) { { const [lo, hi] = ROUTINE_CLAMP[q.concept] ?? [0, 1e9]; answers[q.id] = Math.min(hi, Math.max(lo, Math.round(gauss(rnd, mu + drift, sd)))); } units[q.id] = q.unit!; }
    } else if (q.id === "missed_doses") answers[q.id] = rnd() < 0.8 ? 0 : 1;
    else if (q.id.startsWith("phq9_")) answers[q.id] = q.id === "phq9_9" ? 0 : rnd() < 0.55 ? 1 : 0;
    else if (q.type === "scale") answers[q.id] = 3 + Math.round(rnd());
    else if (q.type === "multi") answers[q.id] = ["none"];
  }
  return { answers, units };
}

type Mutator = (a: Record<string, AnswerValue>, u: Record<string, string>, v: number) => void;
// Kind-specific edits to a routine check-in, per module.
const MUTATORS: Record<string, Partial<Record<Kind, Mutator>>> = {
  hypertension: {
    urgent: (a, _u, v) => { if (v % 2) a.sx_chest = true; else { a.sbp = 192; a.dbp = 112; a.sx_headache_vision = true; } },
    prompt: (a, _u, v) => { a.sbp = 164 + (v % 4) * 3; a.dbp = 96 + (v % 3) * 3; },
    missing: (a) => { delete a.dbp; },
    unit: (a, u) => { a.sbp = 128; u.sbp = "mmol/L"; },
    implausible: (a) => { a.sbp = 1280; },
    contradict: (a) => { a.sbp = 80; a.dbp = 90; },
  },
  t2d: {
    urgent: (a, _u, v) => { if (v % 2) a.sx_severe_hypo = true; else { a.glucose = 45; } },
    prompt: (a, u, v) => { if (v % 2) { a.glucose = 322; u.glucose = "mg/dL"; } else a.sx_mild_hypo = true; },
    missing: (a) => { delete a.sx_vomit; },
    unit: (a, u) => { a.glucose = 5.5; u.glucose = "mg/dL"; },
    implausible: (a) => { a.glucose = 9000; },
    contradict: (a, u) => { a.glucose = 450; u.glucose = "mmol/L"; },
  },
  depression: {
    urgent: (a, _u, v) => { if (v % 2) a.selfharm_now = true; else a.phq9_9 = 3; },
    prompt: (a, _u, v) => { if (v % 2) a.phq9_9 = 1; else for (let i = 1; i <= 8; i++) a[`phq9_${i}`] = 3; },
    missing: (a) => { delete a.phq9_5; },
    unit: (a) => { delete a.selfharm_now; },
    implausible: (a) => { delete a.selfharm_now; },
    contradict: (a) => { a.phq9_9 = 0; a.selfharm_now = true; },
  },
};

function baseProfile(m: Manifest, rnd: () => number, sex: "F" | "M", age: string): Profile {
  const fertile = sex === "F" && age !== "55-74";
  const fields: Record<string, Datum> = {
    allergy_status: datum("none_known", { source: "clinician" }),
    egfr: datum(Math.round(gauss(rnd, 85, 12)), { unit: "mL/min/1.73m²" }),
    pregnancy_status: fertile ? datum(false, { source: "clinician" }) : datum(null, { null_reason: "not_applicable", source: "clinician" }),
    diagnosis_confirmation: datum("confirmed", { source: "clinician" }),
    hba1c: datum(Math.round(gauss(rnd, 56, 10)), { unit: "mmol/mol" }),
    bipolar_screen: datum("screened_negative", { source: "clinician" }),
  };
  return { fields, allergy_status: "none_known", allergies: [], medications: [], conditions: [{ code: m.condition_code, label: m.display_name, tag: m.module_id, verification_status: "verified" }], preferences: [], genotype_reports: [] };
}

function genotype(gene: string, phenotype: string, status: GenotypeReport["status"], expired = false): GenotypeReport {
  return { report_id: `PGX-${gene}-${phenotype}-${status}${expired ? "-exp" : ""}`, gene, phenotype, status, reported_at: iso(new Date(ANCHOR.getTime() - 120 * DAY)), expires_at: expired ? iso(new Date(ANCHOR.getTime() - 10 * DAY)) : null, lab: "Synthetic Genomics Lab (fake)" };
}

export function generatePatients(manifests: Manifest[]): { patients: SyntheticPatient[]; labels: ExpectedLabels } {
  const patients: SyntheticPatient[] = [];
  const labels: ExpectedLabels = { checkin_state: {}, fixtures: {} };
  const tag = (name: string, id: string) => { (labels.fixtures[name] ??= []).push(id); };

  for (const m of manifests) {
    const prefix = PREFIX[m.module_id];
    const meds = MED_CLASS[m.module_id];
    for (let i = 1; i <= 100; i++) {
      const id = `${prefix}-${pad(i)}`;
      const rnd = seedrandom(`${SEED}:${id}`);
      const sex: "F" | "M" = rnd() < 0.5 ? "F" : "M";
      const age = AGE_BANDS[Math.floor(rnd() * 3)];
      const profile = baseProfile(m, rnd, sex, age);
      const scenarios: string[] = [];
      let kind: Kind = "routine";
      let consent_research = rnd() > 0.1;
      let consent_clinical = true;
      let clinician_id = "clin-1";

      // ---- scenario allocation (PRD §10 coverage matrix) ----
      if (i <= 40) scenarios.push("routine");
      else if (i <= 52) { kind = i % 2 ? "urgent" : "prompt"; scenarios.push(kind === "urgent" ? "high_risk_urgent" : "high_risk_prompt"); }
      else if (i <= 58) { kind = (["missing", "unit", "implausible", "contradict", "missing", "unit"] as Kind[])[i - 53]; scenarios.push(`checkin_${kind}`); }
      else if (i <= 64) {
        const v = i - 59; scenarios.push("missing_profile");
        if (v % 3 === 0) { profile.fields.egfr = datum(null, { null_reason: "not_available", source: "lab" }); scenarios.push("egfr_missing"); }
        else if (v % 3 === 1) { profile.allergy_status = "unknown"; profile.fields.allergy_status = datum("unknown", { source: "patient", verification_status: "unverified", null_reason: "unknown" }); scenarios.push("allergy_unknown"); }
        else { profile.fields.egfr = datum(Math.round(gauss(rnd, 70, 10)), { source: "patient", verification_status: "unverified" }); scenarios.push("egfr_unverified"); }
      } else if (i <= 70) {
        const v = i - 65; scenarios.push("contraindication");
        if (v % 3 === 0) { profile.allergy_status = "listed"; profile.allergies = [{ substance: "Synthetic drug (fake)", class_tag: ALLERGY_EXCL[m.module_id], reaction: "rash", verification_status: "verified" }]; profile.fields.allergy_status = datum("listed", { source: "clinician" }); scenarios.push("allergy_conflict"); }
        else if (v % 3 === 1) { profile.fields.egfr = datum(24, { unit: "mL/min/1.73m²" }); profile.conditions.push({ code: "N18", label: "Chronic kidney disease (synthetic)", tag: "kidney_disease", verification_status: "verified" }); scenarios.push("egfr_low_verified"); if (sex === "F") { profile.fields.pregnancy_status = datum(true, { source: "clinician" }); scenarios.push("pregnant"); } }
        else { profile.conditions.push({ code: "G40", label: "Seizure disorder (synthetic)", tag: "seizure_disorder", verification_status: "verified" }); scenarios.push("seizure_disorder"); }
      } else if (i <= 75) {
        scenarios.push("allergy_listed_other"); profile.allergy_status = "listed"; profile.fields.allergy_status = datum("listed", { source: "clinician" });
        profile.allergies = [{ substance: "Synthetic penicillin-like (fake)", class_tag: "penicillin", reaction: "hives", verification_status: "verified" }];
      } else if (i <= 80) {
        const v = i - 76; scenarios.push("pgx");
        const g: GenotypeReport[][] = [[], [genotype("CYP2C19", "indeterminate", "indeterminate")], [genotype("CYP2C19", "poor_metabolizer", "outdated")], [genotype("CYP2C19", "poor_metabolizer", "valid")], [genotype("CYP2C19", "poor_metabolizer", "valid", true)]];
        profile.genotype_reports = g[v]; scenarios.push(["pgx_absent", "pgx_indeterminate", "pgx_outdated", "pgx_supported", "pgx_expired"][v]);
      } else if (i <= 85) { consent_research = false; scenarios.push("research_consent_off"); }
      else if (i <= 87) { consent_clinical = false; scenarios.push("clinical_consent_off"); }
      else if (i <= 90) { scenarios.push(["nonadherence", "med_switch", "incomplete_followup"][i - 88]); }
      else if (i <= 95) { scenarios.push("uncovered_interaction"); }
      else { // paired access-control cases: identical observations, differing assignment/consent
        scenarios.push("paired_access"); if (i % 2 === 0) { clinician_id = "clin-2"; consent_research = false; scenarios.push("paired_other_clinician"); }
      }

      // ---- fixtures ----
      if (id === "DM-042" || id === "DEP-017" || id === "HTN-042") { kind = "routine"; consent_clinical = true; consent_research = id !== "DEP-017"; clinician_id = "clin-1"; scenarios.length = 0; scenarios.push("fixture"); profile.genotype_reports = []; profile.allergy_status = "none_known"; profile.allergies = []; profile.fields.allergy_status = datum("none_known", { source: "clinician" }); profile.conditions = [{ code: m.condition_code, label: m.display_name, tag: m.module_id, verification_status: "verified" }]; }
      if (id === "DM-042") {
        scenarios.push("storyboard_scene1_2_3");
        profile.fields.egfr = datum(52, { unit: "mL/min/1.73m²", source: "patient", verification_status: "unverified" });
        profile.conditions.push({ code: "N18", label: "Kidney condition flag (synthetic)", tag: "kidney_disease", verification_status: "unverified" });
        profile.preferences = ["avoid_hypoglycemia"]; profile.fields.hba1c = datum(61, { unit: "mmol/mol" });
        profile.fields.pregnancy_status = datum(null, { null_reason: "not_applicable", source: "clinician" });
      }
      if (id === "DEP-017") {
        scenarios.push("storyboard_scene4_selfharm_fixture");
        profile.genotype_reports = [genotype("CYP2C19", "poor_metabolizer", "valid")];
        profile.preferences = ["avoid_sexual_side_effects"];
      }
      if (id === "HTN-042") {
        scenarios.push("storyboard_hypertension_slice");
        profile.fields.egfr = datum(78, { unit: "mL/min/1.73m²" });
        profile.preferences = [];
      }
      // PGx genotypes also present for non-depression patients in pgx range: module has no supported pair (never inferred)
      if (i > 90 && i <= 95) { profile.medications.push({ name: "Synthetic anticoagulant (fake)", class_tag: "anticoagulant", start_date: iso(new Date(ANCHOR.getTime() - 200 * DAY)).slice(0, 10), status: "active" }); }

      // ---- treatment, medications, check-ins ----
      const cls = pickW(rnd, CLASS_WEIGHTS[m.module_id]);
      const nCheck = 4 + (i % 5);
      const medStart = iso(new Date(ANCHOR.getTime() - (nCheck + 8) * 7 * DAY)).slice(0, 10);
      const [medName, medClass] = meds[cls];
      const med: MedicationItem = { name: medName, class_tag: medClass, start_date: medStart, status: "active" };
      if (scenarios.includes("med_switch")) {
        const [altCls] = CLASS_WEIGHTS[m.module_id].map((c) => c[0]).filter((c) => c !== cls);
        const [n2, c2] = meds[altCls];
        profile.medications.push({ ...med, status: "stopped", stop_date: iso(new Date(ANCHOR.getTime() - 3 * 7 * DAY)).slice(0, 10), intolerance: "mild nausea (synthetic)" }, { name: n2, class_tag: c2, start_date: iso(new Date(ANCHOR.getTime() - 3 * 7 * DAY)).slice(0, 10), status: "active" });
      } else profile.medications.unshift(med);

      const mut = MUTATORS[m.module_id];
      const checkins: CheckInInput[] = [];
      const kinds: Kind[] = [];
      let present = nCheck;
      if (scenarios.includes("incomplete_followup")) present = Math.max(2, nCheck - 2);
      for (let k = 0; k < present; k++) {
        const last = k === present - 1;
        const kd: Kind = last ? kind : "routine";
        const { answers, units } = routineAnswers(m, rnd, k, present);
        if (scenarios.includes("nonadherence") && k >= present - 3 && m.checkin_question_schema.some((q) => q.id === "missed_doses")) answers.missed_doses = 2 + (k % 2);
        if (kd !== "routine") mut?.[kd]?.(answers, units, i);
        const cid = `ci-${id}-${k + 1}`;
        const at = new Date(ANCHOR.getTime() - (present - 1 - k) * 7 * DAY - (id.charCodeAt(0) % 5) * 3600000);
        // scenario-specific inconsistent units inside an otherwise normal series (T17)
        checkins.push({ id: cid, patient_id: id, module_id: m.module_id, created_at: iso(at), source: "synthetic", answers, units, free_text: "", observed_at: iso(at) });
        kinds.push(kd);
        labels.checkin_state[cid] = EXPECTED_STATE[kd][m.module_id] ?? EXPECTED_STATE[kd]._;
      }
      for (const s of scenarios) tag(s, id);

      // ---- research record (confounding by indication built in) ----
      const sevRoll = rnd();
      const [mildMax, modMax, lo, hi] = SCORE_RANGE[m.module_id];
      const firstClass = CLASS_WEIGHTS[m.module_id][0][0];
      const sevBias = cls === firstClass ? 0.1 : 0; // first-line class goes to somewhat sicker patients
      const sev: Severity = sevRoll < 0.25 - sevBias ? "mild" : sevRoll < 0.78 ? "moderate" : "severe";
      const baseline_score = sev === "mild" ? lo + rnd() * (mildMax - lo) : sev === "moderate" ? mildMax + rnd() * (modMax - mildMax) : modMax + rnd() * (hi - modMax);
      const classEffect = ({ [CLASS_WEIGHTS[m.module_id][1][0]]: 0.06, [CLASS_WEIGHTS[m.module_id][2][0]]: -0.02 } as Record<string, number>)[cls] ?? 0;
      const pMet = Math.min(0.95, Math.max(0.05, BASE_RESPONSE[m.module_id] + classEffect - (sev === "severe" ? 0.15 : sev === "moderate" ? 0.04 : -0.08) + (rnd() - 0.5) * 0.1));
      const pMissing = sev === "severe" ? 0.18 : 0.1;
      const outcome = (p: number) => (rnd() < pMissing ? "missing" : rnd() < p ? "met" : "not_met") as "met" | "not_met" | "missing";
      const spurious = cls === CLASS_WEIGHTS[m.module_id][3][0] || cls === CLASS_WEIGHTS[m.module_id][2][0] ? 0.8 : 0.45; // deliberately spurious: unrelated endpoint tracks a class (T12)
      const research: ResearchRecord = {
        pseudo_id: `R-${(parseInt(Math.floor(rnd() * 0xffffff).toString(), 10) + i * 7919).toString(36).toUpperCase().padStart(6, "0")}`,
        condition_code: m.condition_code, module_id: m.module_id, age_band: age, treatment_class: cls, baseline_severity: sev, baseline_score: Math.round(baseline_score * 10) / 10,
        outcomes: { [m.outcome_definitions[0].id]: outcome(pMet), portal_satisfaction: outcome(spurious) },
        adverse_event: rnd() < 0.08, switched_treatment: scenarios.includes("med_switch") || rnd() < 0.07,
        features: {
          age_band: age, baseline_severity: sev,
          egfr: profile.fields.egfr.verification_status === "conflicting" ? "conflicting" : profile.fields.egfr.value as number | null,
          pregnant: profile.fields.pregnancy_status.value === null ? null : (profile.fields.pregnancy_status.value as boolean),
          adverse_event: null, prior_treatment_class: rnd() < 0.85 ? cls : null, bipolar_history: m.module_id === "depression" ? (rnd() < 0.05 ? true : rnd() < 0.2 ? null : false) : null,
        },
      };
      research.features.adverse_event = research.adverse_event;
      if (i % 23 === 0) research.features.egfr = "conflicting"; // contradictory field for T13

      const seeded_plans: SyntheticPatient["seeded_plans"] = [];
      if (consent_clinical && (i <= 40 || ["DM-042", "DEP-017", "HTN-042"].includes(id))) {
        const items = [{ type: "medication_class" as const, text: `Continue your current ${meds[cls][1].replace(/_/g, " ")} treatment as agreed with your clinician.` }, { type: "follow_up_action" as const, text: "Complete a short check-in once a week." }];
        seeded_plans.push({ version: 1, items, at: iso(new Date(ANCHOR.getTime() - (present + 2) * 7 * DAY)), reason: "Seeded baseline plan (synthetic)" });
        if (i % 7 === 0) seeded_plans.push({ version: 2, items: [...items, { type: "info", text: "Bring your home readings to your next visit." }], at: iso(new Date(ANCHOR.getTime() - 2 * 7 * DAY)), reason: "Seeded follow-up update (synthetic)" });
      }

      patients.push({
        id, display_name: `Fakename Testperson (${id})`, module_id: m.module_id, condition_code: m.condition_code, clinician_id, age_band: age, sex_at_birth: sex,
        profile, consent_clinical, consent_research, scenarios, checkins, seeded_plans, research,
      });
    }
  }
  // Paired cases (identical observations, different assignment/consent): copy odd partner's check-ins onto the even one.
  for (const m of manifests) {
    const prefix = PREFIX[m.module_id];
    for (let i = 96; i <= 100; i += 2) {
      const a = patients.find((p) => p.id === `${prefix}-${pad(i)}`), b = patients.find((p) => p.id === `${prefix}-${pad(i + 1)}`);
      if (!a || !b) continue;
      b.checkins = a.checkins.map((c, k) => ({ ...c, id: `ci-${b.id}-${k + 1}`, patient_id: b.id }));
      b.profile = JSON.parse(JSON.stringify(a.profile));
      b.research = { ...a.research, pseudo_id: b.research.pseudo_id };
      a.checkins.forEach((c, k) => { labels.checkin_state[b.checkins[k].id] = labels.checkin_state[c.id]; });
    }
  }
  return { patients, labels };
}
