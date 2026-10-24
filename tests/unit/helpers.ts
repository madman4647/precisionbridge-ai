import { loadBundled } from "@/core/modules/registry";
import type { Manifest } from "@/core/modules/schema";
import type { AnswerValue, CheckInInput, Datum, Profile } from "@/core/types";

export const MANIFESTS = loadBundled();
export const M = (id: string): Manifest => MANIFESTS.find((m) => m.module_id === id)!;

export const ROUTINE: Record<string, { answers: Record<string, AnswerValue>; units: Record<string, string> }> = {
  hypertension: { answers: { sbp: 128, dbp: 80, sx_chest: false, sx_neuro: false, sx_headache_vision: false, missed_doses: 0 }, units: { sbp: "mmHg", dbp: "mmHg" } },
  t2d: { answers: { glucose: 110, sx_severe_hypo: false, sx_vomit: false, sx_mild_hypo: false, missed_doses: 0 }, units: { glucose: "mg/dL" } },
  depression: { answers: { phq9_1: 1, phq9_2: 1, phq9_3: 0, phq9_4: 1, phq9_5: 0, phq9_6: 0, phq9_7: 1, phq9_8: 0, phq9_9: 0, selfharm_now: false, missed_doses: 0 }, units: {} },
};

export function checkin(moduleId: string, over: Record<string, AnswerValue | undefined> = {}, units: Record<string, string> = {}, free_text = ""): CheckInInput {
  const base = ROUTINE[moduleId];
  const answers: Record<string, AnswerValue> = { ...base.answers };
  for (const [k, v] of Object.entries(over)) { if (v === undefined) delete answers[k]; else answers[k] = v; }
  return { id: `ci-test-${Math.random().toString(36).slice(2, 8)}`, patient_id: "TEST-001", module_id: moduleId, created_at: "2026-10-20T09:00:00.000Z", source: "synthetic", answers, units: { ...base.units, ...units }, free_text, observed_at: "2026-10-20T09:00:00.000Z" };
}

export const d = (value: Datum["value"], over: Partial<Datum> = {}): Datum => ({ value, observed_at: "2026-10-01T00:00:00Z", source: "lab", verification_status: "verified", ...over });

export function profile(over: Partial<Profile> = {}, fields: Record<string, Datum> = {}): Profile {
  return {
    fields: { allergy_status: d("none_known", { source: "clinician" }), egfr: d(80), pregnancy_status: d(null, { null_reason: "not_applicable" }), bipolar_screen: d("screened_negative"), ...fields },
    allergy_status: "none_known", allergies: [], medications: [], conditions: [], preferences: [], genotype_reports: [], ...over,
  };
}
