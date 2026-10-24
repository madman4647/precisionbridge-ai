import { describe, expect, it } from "vitest";
import { summarizeCohort, type ResearchRecord } from "@/core/research/cohort";
import { buildHypotheses } from "@/core/hypotheses/builder";
import { prescreen, TrialSnapshotSchema } from "@/core/trials/prescreen";
import { wilson } from "@/core/research/stats";
import { MANIFESTS } from "./helpers";
import { generatePatients } from "@/db/seed/generator";
import snapshot from "@/modules-data/trial-snapshot.json";
import catalog from "@/modules-data/evidence-catalog.json";

const { patients } = generatePatients(MANIFESTS);
const recs = (cond: string, consent = true): ResearchRecord[] => patients.filter((p) => p.condition_code === cond && (!consent || p.consent_research)).map((p) => p.research);
const def = { condition_code: "T2D", endpoint_id: "glycemic_target_8w", window_weeks: 8 };

describe("cohort summary", () => {
  it("same definition twice gives identical results (reproducibility)", () => {
    const a = summarizeCohort(recs("T2D"), def), b = summarizeCohort([...recs("T2D")].reverse(), def);
    expect(a.result_hash).toBe(b.result_hash);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it("T11 cells with n<10 are suppressed with no counts or proportions", () => {
    const s = summarizeCohort(recs("T2D"), def);
    const sup = s.cells.filter((c) => c.suppressed);
    expect(sup.length).toBeGreaterThan(0);
    for (const c of sup) { expect(c.display_n).toBe("<10"); expect(c.n).toBeNull(); expect(c.proportion).toBeNull(); expect(c.ci).toBeNull(); }
    for (const c of s.cells.filter((x) => !x.suppressed && x.observed !== null)) { expect(c.n).toBeGreaterThanOrEqual(10); expect(c.ci).not.toBeNull(); }
    for (const b of s.baseline_differences) if (b.n !== null) expect(b.n).toBeGreaterThanOrEqual(10);
  });
  it("threshold is configurable", () => {
    const s5 = summarizeCohort(recs("T2D"), def, { threshold: 5 }), s10 = summarizeCohort(recs("T2D"), def);
    expect(s5.suppressed_cell_count).toBeLessThanOrEqual(s10.suppressed_cell_count);
  });
  it("carries the confounding / non-causality caveats and counts missing outcomes separately", () => {
    const s = summarizeCohort(recs("T2D"), def);
    expect(s.caveats.join(" ")).toMatch(/confounding by indication/i);
    expect(s.cells.some((c) => (c.missing_outcomes ?? 0) > 0)).toBe(true);
  });
  it("contains no direct identifiers", () => {
    const json = JSON.stringify(summarizeCohort(recs("T2D"), def));
    expect(json).not.toMatch(/DM-\d|Fakename|patient_id/);
  });
  it("Wilson interval is sane", () => {
    const w = wilson(50, 100)!; expect(w.lo).toBeCloseTo(0.404, 2); expect(w.hi).toBeCloseTo(0.596, 2);
    expect(wilson(0, 0)).toBeNull();
  });
});

describe("hypotheses (T11, T12)", () => {
  const h = buildHypotheses(recs("T2D"), { condition_code: "T2D", cohort_hash: "x", threshold: 10, catalog, window_label: "8 weeks" });
  it("spurious unrelated-endpoint association stays exploratory with the full caveat checklist", () => {
    const sp = h.find((x) => x.outcome === "portal_satisfaction" && x.promoted);
    expect(sp).toBeDefined();
    expect(sp!.disclaimer).toBe("exploratory_only");
    expect(sp!.label).toBe("Demonstration-only; not evidence of efficacy.");
    expect(sp!.literature_support).toBe(false);
    expect(sp!.caveats.map((c) => c.key)).toEqual(["confounding", "selection", "missingness", "switching", "multiple_testing", "reverse_causality", "small_sample"]);
    expect(sp!.caveats.find((c) => c.key === "confounding")!.flagged).toBe(true);
  });
  it("small groups are suppressed and the hypothesis is not promoted", () => {
    const small = buildHypotheses(recs("T2D").slice(0, 25), { condition_code: "T2D", cohort_hash: "x", threshold: 10, catalog, window_label: "8 weeks" });
    expect(small.every((x) => !x.promoted || x.subgroup_n.exposed_n! >= 10)).toBe(true);
    for (const x of small.filter((y) => !y.promoted)) { expect(x.observed_association.difference).toBeNull(); expect(x.not_promoted_reason).toMatch(/below small-cell/); }
  });
});

describe("trial pre-screen (T13)", () => {
  const snap = TrialSnapshotSchema.parse(snapshot);
  const t2d = snap.trials.find((t) => t.id === "MOCK-T2D-001")!;
  const base = { baseline_severity: "moderate", egfr: 60, pregnant: false, adverse_event: false };
  it("complete features → at most 'Potential trial for manual review'", () => {
    const r = prescreen(t2d, base, snap.snapshot_date);
    expect(r.overall).toBe("Potential trial for manual review");
    expect(JSON.stringify(r)).not.toMatch(/\beligible\b/i);
  });
  it("unknown or conflicting fields never produce a definitive match", () => {
    expect(prescreen(t2d, { ...base, egfr: "conflicting" }, snap.snapshot_date).overall).toBe("Insufficient information");
    expect(prescreen(t2d, { ...base, egfr: null }, snap.snapshot_date).criteria.some((c) => c.verdict === "insufficient_information")).toBe(true);
  });
  it("exclusion criteria met → appears not to match", () => {
    expect(prescreen(t2d, { ...base, pregnant: true }, snap.snapshot_date).overall).toBe("Appears not to match");
  });
});
