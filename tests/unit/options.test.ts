import { describe, expect, it } from "vitest";
import { buildComparison } from "@/core/options/pipeline";
import { evaluatePgx } from "@/core/pgx/applicability";
import { validateManifest } from "@/core/modules/validator";
import { MANIFESTS, M, d, profile } from "./helpers";
import hypertension from "@/modules-data/hypertension.json";
import { SAMPLE_MODULES } from "@/core/modules/registry";

const card = (r: ReturnType<typeof buildComparison>, id: string) => r.cards.find((c) => c.option_id === id)!;

describe("option comparison pipeline", () => {
  it("blocks entirely on URGENT, UNABLE_TO_ASSESS and missing safety evaluation", () => {
    for (const s of ["URGENT", "UNABLE_TO_ASSESS", null] as const) {
      const r = buildComparison({ manifest: M("t2d"), safety_state: s, profile: profile() });
      expect(r.blocked).toBe(true);
      expect(r.cards).toHaveLength(0);
    }
  });

  it("uses the 'Potential options to consider' heading, never doses or probabilities", () => {
    const r = buildComparison({ manifest: M("hypertension"), safety_state: "ROUTINE", profile: profile() });
    expect(r.heading).toBe("Potential options to consider");
    const text = JSON.stringify(r);
    expect(text).not.toMatch(/\bmg\b|best treatment|probability|\d+% (chance|likely)/i);
  });

  it("T04 documented allergy to a class excludes that card with an explanation", () => {
    const p = profile({ allergy_status: "listed", allergies: [{ substance: "x", class_tag: "ace_inhibitor", reaction: "rash", verification_status: "verified" }] }, { allergy_status: d("listed", { source: "clinician" }) });
    const c = card(buildComparison({ manifest: M("hypertension"), safety_state: "ROUTINE", profile: p }), "htn_acei_arb");
    expect(c.status).toBe("excluded_by_rule");
    expect(c.exclusion_reasons.join(" ")).toMatch(/allergy/i);
  });

  it("T05 missing kidney function → no assumption of normal; manual review, no personalised ranking", () => {
    const p = profile({}, { egfr: d(null, { null_reason: "not_available" }) });
    const r = buildComparison({ manifest: M("t2d"), safety_state: "ROUTINE", profile: p });
    expect(r.personalized_ranking).toBe(false);
    expect(r.missing_fields.map((m) => m.key)).toContain("egfr");
    expect(r.cards.every((c) => c.status !== "eligible_for_review" || c.option_type === "non_drug" ? true : false)).toBe(true);
    expect(card(r, "t2d_metformin").status).toBe("requires_manual_review");
  });

  it("unverified renal labs require manual review, an unverified low eGFR is not a silent exclusion", () => {
    const p = profile({}, { egfr: d(25, { verification_status: "unverified", source: "patient" }) });
    const c = card(buildComparison({ manifest: M("t2d"), safety_state: "ROUTINE", profile: p }), "t2d_metformin");
    expect(c.status).toBe("requires_manual_review");
    expect(c.missing_checks.join(" ")).toMatch(/unverified/);
    const verified = card(buildComparison({ manifest: M("t2d"), safety_state: "ROUTINE", profile: profile({}, { egfr: d(25) }) }), "t2d_metformin");
    expect(verified.status).toBe("excluded_by_rule");
  });

  it("unknown allergy status never silently proceeds", () => {
    const p = profile({ allergy_status: "unknown" }, { allergy_status: d("unknown", { verification_status: "unverified", null_reason: "unknown" }) });
    const r = buildComparison({ manifest: M("hypertension"), safety_state: "ROUTINE", profile: p });
    expect(r.personalized_ranking).toBe(false);
    expect(r.cards.filter((c) => c.status === "eligible_for_review")).toHaveLength(0);
  });

  it("complete verified profile yields eligible cards; preferences annotate (aligns/conflicts)", () => {
    const p = profile({ preferences: ["avoid_hypoglycemia"] });
    const r = buildComparison({ manifest: M("t2d"), safety_state: "ROUTINE", profile: p });
    expect(r.personalized_ranking).toBe(true);
    expect(card(r, "t2d_su").preference_notes[0].effect).toBe("conflicts");
    expect(card(r, "t2d_metformin").preference_notes[0].effect).toBe("aligns");
    expect(r.cards.indexOf(card(r, "t2d_su"))).toBeGreaterThan(r.cards.indexOf(card(r, "t2d_metformin")));
  });

  it("every displayed card has a valid evidence reference (module id/version, source, dates, jurisdiction, rationale, population)", () => {
    for (const m of MANIFESTS) {
      const r = buildComparison({ manifest: m, safety_state: "ROUTINE", profile: profile() });
      expect(r.cards.length).toBeGreaterThan(0);
      for (const c of r.cards) {
        expect(c.evidence.length).toBeGreaterThan(0);
        for (const e of c.evidence) {
          expect(e.module_id).toBe(m.module_id); expect(e.module_version).toBe(m.module_version);
          expect(m.guideline_sources.map((s) => s.id)).toContain(e.guideline_source_id);
          for (const k of ["published", "reviewed", "jurisdiction", "rationale", "applicable_population", "source_title"] as const) expect(e[k], k).toBeTruthy();
        }
        expect(c.illustrative).toBe(true);
      }
    }
  });

  it("T14 removed or expired guideline source → card withheld with 'Insufficient evidence'", () => {
    const removed = JSON.parse(JSON.stringify(M("t2d")));
    removed.guideline_sources = [{ ...removed.guideline_sources[0], id: "other" }];
    const r1 = buildComparison({ manifest: removed, safety_state: "ROUTINE", profile: profile() });
    expect(r1.cards).toHaveLength(0);
    expect(r1.withheld.length).toBeGreaterThan(0);
    expect(r1.withheld[0].message).toBe("Insufficient evidence — manual review required.");
    const expired = JSON.parse(JSON.stringify(M("t2d")));
    expired.guideline_sources[0].review_by = "2026-10-01";
    const r2 = buildComparison({ manifest: expired, safety_state: "ROUTINE", profile: profile(), now: new Date("2026-10-24") });
    expect(r2.cards).toHaveLength(0);
  });

  it("T16 interaction not covered by curated content → explicit coverage warning, not safe-by-default", () => {
    const p = profile({ medications: [{ name: "x", class_tag: "anticoagulant", start_date: "2026-01-01", status: "active" }] });
    const r = buildComparison({ manifest: M("hypertension"), safety_state: "ROUTINE", profile: p });
    const c = r.cards.find((x) => x.status !== "excluded_by_rule")!;
    expect(c.coverage_warnings.join(" ")).toMatch(/coverage incomplete/i);
    expect(c.status).toBe("requires_manual_review");
  });
});

describe("PGx applicability", () => {
  const dep = M("depression");
  const rep = (over: any = {}) => ({ report_id: "r", gene: "CYP2C19", phenotype: "poor_metabolizer", status: "valid" as const, reported_at: "2026-06-01", expires_at: null, lab: "x", ...over });
  const now = new Date("2026-10-24");
  it("T07 absent / indeterminate / outdated / expired / unsupported → 'No actionable PGx conclusion'", () => {
    for (const reports of [[], [rep({ status: "indeterminate" })], [rep({ status: "outdated" })], [rep({ expires_at: "2026-01-01" })], [rep({ phenotype: "normal_metabolizer" })]]) {
      const r = evaluatePgx(dep, "dep_ssri", reports, now);
      expect(r.applicable).toBe(false);
      expect(r.headline).toBe("No actionable PGx conclusion");
    }
  });
  it("applies only for a valid report + listed drug–gene pair, with no dose instruction", () => {
    const r = evaluatePgx(dep, "dep_ssri", [rep()], now);
    expect(r.applicable).toBe(true);
    expect(r.detail).toMatch(/no dose or switch instruction/);
    expect(evaluatePgx(dep, "dep_snri", [rep()], now).applicable).toBe(false); // pair not listed
  });
  it("never applies in modules without drug_gene_evidence (no disease branching)", () => {
    for (const id of ["hypertension", "t2d"]) {
      for (const c of M(id).treatment_option_cards) expect(evaluatePgx(M(id), c.id, [rep()], now).applicable).toBe(false);
    }
  });
});

describe("module validation (T18, F15)", () => {
  it("bundled modules validate through the same schema", () => { expect(MANIFESTS).toHaveLength(3); });
  it("rejects malformed rules, missing approver and expired evidence; cannot be activated", () => {
    const bad = validateManifest(SAMPLE_MODULES.invalid_demo);
    expect(bad.ok).toBe(false);
    expect(bad.errors.join(" ")).toMatch(/clinical_approver/);
    expect(bad.manifest).toBeUndefined();
    const exp = validateManifest(SAMPLE_MODULES.expired_demo, new Date("2026-10-24"));
    expect(exp.ok).toBe(false);
    expect(exp.errors.join(" ")).toMatch(/expired/);
  });
  it("accepts a 4th dummy module without code changes", () => {
    const ok = validateManifest(SAMPLE_MODULES.asthma_demo, new Date("2026-10-24"));
    expect(ok.ok).toBe(true);
  });
  it("rejects rules referencing unknown fields and non-DSL operators", () => {
    const m = JSON.parse(JSON.stringify(hypertension));
    m.red_flag_rules[0].when = { op: "cmp", field: "answers.nonexistent", cmp: "gt", value: 1 };
    expect(validateManifest(m).ok).toBe(false);
    const m2 = JSON.parse(JSON.stringify(hypertension));
    m2.red_flag_rules[0].when = { op: "eval", code: "1" };
    expect(validateManifest(m2).ok).toBe(false);
  });
});
