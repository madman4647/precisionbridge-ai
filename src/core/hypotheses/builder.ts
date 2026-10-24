import { canonical, hashString, mean, wilson } from "../research/stats";
import type { ResearchRecord } from "../research/cohort";

export interface EvidenceCatalogEntry { id: string; title: string; exposure_class: string; endpoint: string; note: string }

export interface CaveatItem { key: string; label: string; flagged: boolean; note: string }

export interface HypothesisCandidate {
  id: string;
  cohort_hash: string;
  condition_code: string;
  exposure: string;
  outcome: string;
  window: string;
  subgroup_n: { exposed_n: number | null; exposed_observed: number | null; comparison_observed: number | null };
  observed_association: { exposed_proportion: number | null; comparison_proportion: number | null; difference: number | null; ci_note: string };
  caveats: CaveatItem[];
  evidence_ids: string[];
  literature_support: boolean;
  promoted: boolean;
  not_promoted_reason?: string;
  comparisons_tested: number;
  disclaimer: "exploratory_only";
  label: "Demonstration-only; not evidence of efficacy.";
}

const SIGNAL = 0.1;

/** Exploratory hypothesis candidates from consent-filtered, de-identified records. Never feeds patient option cards. */
export function buildHypotheses(records: ResearchRecord[], opts: { condition_code: string; cohort_hash: string; threshold: number; catalog: EvidenceCatalogEntry[]; window_label: string }): HypothesisCandidate[] {
  const pool = records.filter((r) => r.condition_code === opts.condition_code);
  const classes = [...new Set(pool.map((r) => r.treatment_class))].sort();
  const endpoints = [...new Set(pool.flatMap((r) => Object.keys(r.outcomes)))].sort();
  const tests = classes.length * endpoints.length;
  const out: HypothesisCandidate[] = [];
  for (const cls of classes) {
    for (const ep of endpoints) {
      const exposed = pool.filter((r) => r.treatment_class === cls);
      const comp = pool.filter((r) => r.treatment_class !== cls);
      const obs = (xs: ResearchRecord[]) => xs.filter((r) => (r.outcomes[ep] ?? "missing") !== "missing");
      const eo = obs(exposed), co = obs(comp);
      const prop = (xs: ResearchRecord[]) => (xs.length ? xs.filter((r) => r.outcomes[ep] === "met").length / xs.length : null);
      const pe = prop(eo), pc = prop(co);
      if (pe === null || pc === null) continue;
      const diff = pe - pc;
      if (Math.abs(diff) < SIGNAL) continue;
      const small = exposed.length < opts.threshold || eo.length < opts.threshold || co.length < opts.threshold;
      const confounded = Math.abs((mean(exposed.map((r) => r.baseline_score)) ?? 0) - (mean(comp.map((r) => r.baseline_score)) ?? 0)) > 1.5;
      const missingShare = 1 - (eo.length + co.length) / Math.max(1, exposed.length + comp.length);
      const switching = exposed.filter((r) => r.switched_treatment).length / Math.max(1, exposed.length);
      const cat = opts.catalog.filter((c) => c.exposure_class === cls && c.endpoint === ep);
      const caveats: CaveatItem[] = [
        { key: "confounding", label: "Confounding (by indication)", flagged: true, note: confounded ? "Baseline severity differs between exposed and comparison groups." : "Treatment not randomised; unmeasured confounders cannot be excluded." },
        { key: "selection", label: "Selection", flagged: true, note: "Only research-consented records are included; consenting patients may differ." },
        { key: "missingness", label: "Missing outcomes", flagged: missingShare > 0.15, note: `${Math.round(missingShare * 100)}% of records lack the outcome; not imputed.` },
        { key: "switching", label: "Treatment switching", flagged: switching > 0.1, note: `${Math.round(switching * 100)}% of exposed patients switched treatment.` },
        { key: "multiple_testing", label: "Multiple testing", flagged: true, note: `${tests} exposure–endpoint comparisons were screened; some apparent signals are expected by chance.` },
        { key: "reverse_causality", label: "Reverse causality", flagged: true, note: "Direction of effect cannot be established from observational snapshots." },
        { key: "small_sample", label: "Small sample", flagged: small, note: small ? `At least one group has fewer than ${opts.threshold} patients/observed outcomes.` : "Group sizes meet the display threshold, but remain small for inference." },
      ];
      const ci = wilson(eo.filter((r) => r.outcomes[ep] === "met").length, eo.length);
      const base = {
        cohort_hash: opts.cohort_hash, condition_code: opts.condition_code, exposure: cls, outcome: ep, window: opts.window_label,
      };
      out.push({
        id: `hyp_${hashString(canonical({ ...base }))}`, ...base,
        subgroup_n: small ? { exposed_n: null, exposed_observed: null, comparison_observed: null } : { exposed_n: exposed.length, exposed_observed: eo.length, comparison_observed: co.length },
        observed_association: small
          ? { exposed_proportion: null, comparison_proportion: null, difference: null, ci_note: `Suppressed (<${opts.threshold})` }
          : { exposed_proportion: pe, comparison_proportion: pc, difference: diff, ci_note: ci ? `Exposed 95% CI (Wilson): ${(ci.lo * 100).toFixed(0)}–${(ci.hi * 100).toFixed(0)}%` : "" },
        caveats, evidence_ids: cat.map((c) => c.id), literature_support: cat.length > 0,
        promoted: !small,
        not_promoted_reason: small ? `Sample below small-cell threshold (${opts.threshold}); hypothesis not promoted.` : undefined,
        comparisons_tested: tests, disclaimer: "exploratory_only", label: "Demonstration-only; not evidence of efficacy.",
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.observed_association.difference ?? 0) - Math.abs(a.observed_association.difference ?? 0) || a.id.localeCompare(b.id));
}
