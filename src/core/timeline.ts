import type { CheckInInput, MedicationItem, RiskEvaluation } from "./types";

export interface WhatChanged { has_previous: boolean; items: string[] }

/** "What changed" since the previous check-in: state, observations, answers, medications, plan. Pure. */
export function buildWhatChanged(checkins: CheckInInput[], evals: RiskEvaluation[], meds: MedicationItem[], plans: { version: number; signed_at: string }[]): WhatChanged {
  if (checkins.length === 0) return { has_previous: false, items: ["No check-ins recorded yet."] };
  const last = checkins[checkins.length - 1];
  const prev = checkins.length > 1 ? checkins[checkins.length - 2] : null;
  const evOf = (id: string) => evals.find((e) => e.checkin_id === id);
  const items: string[] = [];
  const le = evOf(last.id), pe = prev ? evOf(prev.id) : null;
  if (le) items.push(pe && pe.state !== le.state ? `Safety state changed ${pe.state} → ${le.state}` : `Safety state ${le.state}`);
  if (le?.triggered_rule_ids.length) items.push(`Rules triggered: ${le.triggered_rule_ids.join(", ")}`);
  if (le?.missing_fields.length) items.push(`Missing answers: ${le.missing_fields.join(", ")}`);
  if (prev) {
    for (const [k, v] of Object.entries(last.answers)) {
      const pv = prev.answers[k];
      if (typeof v === "number" && typeof pv === "number" && v !== pv) items.push(`${k}: ${pv} → ${v}`);
      else if (typeof v === "boolean" && typeof pv === "boolean" && v !== pv) items.push(`${k}: ${pv ? "yes" : "no"} → ${v ? "yes" : "no"}`);
    }
  }
  for (const m of meds) {
    if (m.start_date > (prev?.created_at ?? "").slice(0, 10)) items.push(`Medication started ${m.start_date}: ${m.name}`);
    if (m.stop_date && m.stop_date > (prev?.created_at ?? "").slice(0, 10)) items.push(`Medication stopped ${m.stop_date}: ${m.name}`);
  }
  const lp = plans[plans.length - 1];
  if (lp && lp.signed_at > (prev?.created_at ?? "")) items.push(`Care plan v${lp.version} signed ${lp.signed_at.slice(0, 10)}`);
  return { has_previous: !!prev, items: items.length ? items : ["No change since the previous check-in."] };
}
