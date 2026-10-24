import { summarizeCohort, definitionHash, type CohortDefinition, type CohortSummary, type ResearchRecord } from "../research/cohort";
import { buildHypotheses, type EvidenceCatalogEntry, type HypothesisCandidate } from "../hypotheses/builder";
import { prescreen, type PrescreenResult, type TrialSnapshot } from "../trials/prescreen";

/** Research Wing: operates only on consent-authorised, de-identified records handed in by the governance gate. */
export function runCohort(records: ResearchRecord[], def: CohortDefinition, opts: { threshold: number; excluded_without_consent: number }): CohortSummary {
  return summarizeCohort(records, def, opts);
}

export function runHypotheses(records: ResearchRecord[], def: CohortDefinition, opts: { threshold: number; catalog: EvidenceCatalogEntry[] }): HypothesisCandidate[] {
  return buildHypotheses(records, { condition_code: def.condition_code, cohort_hash: definitionHash(def), threshold: opts.threshold, catalog: opts.catalog, window_label: `${def.window_weeks} weeks` });
}

export function runTrialPrescreen(snapshot: TrialSnapshot, conditionCode: string, features: ResearchRecord["features"]): PrescreenResult[] {
  return snapshot.trials.filter((t) => t.condition_code === conditionCode).map((t) => prescreen(t, features, snapshot.snapshot_date));
}
