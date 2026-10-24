import { z } from "zod";
import { CondSchema, evalCond, type Cond } from "../modules/dsl";

export const TrialSnapshotSchema = z.object({
  snapshot_date: z.string(),
  source: z.string(),
  trials: z.array(z.object({
    id: z.string(), title: z.string(), condition_code: z.string(), status: z.string(), last_update: z.string(), sponsor: z.string(),
    criteria: z.array(z.object({ id: z.string(), kind: z.enum(["inclusion", "exclusion"]), text: z.string(), when: CondSchema })),
  })),
});
export type TrialSnapshot = z.infer<typeof TrialSnapshotSchema>;
export type Trial = TrialSnapshot["trials"][number];

export type CriterionVerdict = "appears_to_match" | "appears_not_to_match" | "insufficient_information";
export type OverallLabel = "Potential trial for manual review" | "Appears not to match" | "Insufficient information";

export interface PrescreenResult {
  trial_id: string; title: string; status: string; last_update: string; snapshot_date: string;
  criteria: { id: string; kind: "inclusion" | "exclusion"; text: string; verdict: CriterionVerdict }[];
  overall: OverallLabel;
  note: string;
}

export const MIN_CHECKED_CRITERIA = 3;

/** Criterion-level pre-screen. Conflicting/unknown features never produce a definitive "eligible" (T13). */
export function prescreen(trial: Trial, features: Record<string, string | number | boolean | null>, snapshot_date: string): PrescreenResult {
  const resolve = (path: string) => {
    const v = features[path.split(".")[1]];
    return { value: v === "conflicting" ? null : v, verified: true };
  };
  const rows = trial.criteria.map((c) => {
    const r = evalCond(c.when as Cond, resolve).result;
    const verdict: CriterionVerdict = r === "unknown" ? "insufficient_information" : c.kind === "inclusion" ? (r === "true" ? "appears_to_match" : "appears_not_to_match") : r === "true" ? "appears_not_to_match" : "appears_to_match";
    return { id: c.id, kind: c.kind, text: c.text, verdict };
  });
  const checked = rows.filter((r) => r.verdict !== "insufficient_information").length;
  const overall: OverallLabel = rows.some((r) => r.verdict === "appears_not_to_match") ? "Appears not to match"
    : rows.some((r) => r.verdict === "insufficient_information") || checked < MIN_CHECKED_CRITERIA ? "Insufficient information"
    : "Potential trial for manual review";
  return {
    trial_id: trial.id, title: trial.title, status: trial.status, last_update: trial.last_update, snapshot_date, criteria: rows, overall,
    note: "Pre-screen only. Eligibility must be confirmed by the trial team. No enrollment is implied. Mock registry snapshot — not live data.",
  };
}
