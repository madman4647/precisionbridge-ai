import { canonical, hashString, mean, wilson } from "./stats";

export type Severity = "mild" | "moderate" | "severe";
export type OutcomeFlag = "met" | "not_met" | "missing";

/** De-identified research record. Never contains name, patient id, or exact dates. */
export interface ResearchRecord {
  pseudo_id: string;
  condition_code: string;
  module_id: string;
  age_band: string;
  treatment_class: string;
  baseline_severity: Severity;
  baseline_score: number;
  outcomes: Record<string, OutcomeFlag>;
  adverse_event: boolean;
  switched_treatment: boolean;
  features: Record<string, string | number | boolean | null>;
}

export interface CohortDefinition {
  condition_code: string;
  endpoint_id: string;
  window_weeks: number;
  treatment_class?: string | null;
  baseline_severity?: Severity | null;
}

export const DEFAULT_THRESHOLD = 10;

export function definitionHash(def: CohortDefinition): string {
  return hashString(canonical({ ...def, treatment_class: def.treatment_class ?? null, baseline_severity: def.baseline_severity ?? null }));
}

export interface Cell {
  treatment_class: string;
  baseline_severity: Severity;
  suppressed: boolean;
  n: number | null;
  observed: number | null;
  responders: number | null;
  missing_outcomes: number | null;
  proportion: number | null;
  ci: { lo: number; hi: number } | null;
  display_n: string;
  display_N: string;
}

export interface CohortSummary {
  definition: CohortDefinition;
  definition_hash: string;
  threshold: number;
  cells: Cell[];
  total_in_displayed_cells: number;
  suppressed_cell_count: number;
  baseline_differences: { treatment_class: string; n: number | null; mean_baseline_score: number | null; pct_severe: number | null }[];
  excluded_without_consent: number;
  caveats: string[];
  result_hash: string;
}

export const COHORT_CAVEATS = [
  "Confounding by indication: treatment was not randomly assigned, so subgroup differences are not evidence that a treatment caused improvement.",
  "Synthetic data: associations reflect the generator, not real patients. Nothing here is evidence of efficacy.",
  "Descriptive and unadjusted. Missing follow-up outcomes are shown separately and are not imputed.",
];

const SEVERITIES: Severity[] = ["mild", "moderate", "severe"];

/** Pure, deterministic cohort summary with small-cell suppression. Same definition + same records => identical output (F14). */
export function summarizeCohort(records: ResearchRecord[], def: CohortDefinition, opts: { threshold?: number; excluded_without_consent?: number } = {}): CohortSummary {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const pool = records
    .filter((r) => r.condition_code === def.condition_code)
    .filter((r) => !def.treatment_class || r.treatment_class === def.treatment_class)
    .filter((r) => !def.baseline_severity || r.baseline_severity === def.baseline_severity)
    .sort((a, b) => a.pseudo_id.localeCompare(b.pseudo_id));

  const classes = [...new Set(pool.map((r) => r.treatment_class))].sort();
  const cells: Cell[] = [];
  for (const tc of classes) {
    for (const sev of SEVERITIES) {
      const grp = pool.filter((r) => r.treatment_class === tc && r.baseline_severity === sev);
      if (grp.length === 0) continue;
      const observed = grp.filter((r) => (r.outcomes[def.endpoint_id] ?? "missing") !== "missing");
      const responders = observed.filter((r) => r.outcomes[def.endpoint_id] === "met").length;
      const n = grp.length;
      if (n < threshold) {
        cells.push({ treatment_class: tc, baseline_severity: sev, suppressed: true, n: null, observed: null, responders: null, missing_outcomes: null, proportion: null, ci: null, display_n: `<${threshold}`, display_N: "—" });
        continue;
      }
      const N = observed.length;
      const ok = N >= threshold;
      cells.push({
        treatment_class: tc, baseline_severity: sev, suppressed: false, n, observed: ok ? N : null, responders: ok ? responders : null,
        missing_outcomes: ok ? n - N : null, proportion: ok ? responders / N : null, ci: ok ? wilson(responders, N) : null,
        display_n: String(n), display_N: ok ? String(N) : `<${threshold}`,
      });
    }
  }
  // Complementary suppression: if exactly one cell in a treatment class is suppressed, row totals could reveal it; we never show row totals,
  // and the overall figure counts displayed cells only.
  const total = cells.reduce((s, c) => s + (c.n ?? 0), 0);
  const baseline_differences = classes.map((tc) => {
    const classCells = cells.filter((c) => c.treatment_class === tc);
    const any = classCells.some((c) => c.suppressed);
    const grp = pool.filter((r) => r.treatment_class === tc);
    if (any || grp.length < threshold) return { treatment_class: tc, n: null, mean_baseline_score: null, pct_severe: null };
    return { treatment_class: tc, n: grp.length, mean_baseline_score: round(mean(grp.map((r) => r.baseline_score))!, 1), pct_severe: round((grp.filter((r) => r.baseline_severity === "severe").length / grp.length) * 100, 0) };
  });
  const body = { definition: def, definition_hash: definitionHash(def), threshold, cells, total_in_displayed_cells: total, suppressed_cell_count: cells.filter((c) => c.suppressed).length, baseline_differences, excluded_without_consent: opts.excluded_without_consent ?? 0, caveats: COHORT_CAVEATS };
  return { ...body, result_hash: hashString(canonical({ ...body, excluded_without_consent: 0 })) };
}

function round(x: number, d: number) { const m = 10 ** d; return Math.round(x * m) / m; }
