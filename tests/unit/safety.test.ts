import { describe, expect, it } from "vitest";
import { evaluateRules, runSafety } from "@/core/safety/engine";
import { comparisonBlocked } from "@/core/safety/gate";
import { processCheckIn } from "@/core/orchestrator/patientWing";
import { MANIFESTS, M, checkin } from "./helpers";
import { generatePatients } from "@/db/seed/generator";

// One triggering fixture per red-flag rule. Every rule in every manifest must be covered.
const RULE_FIXTURES: Record<string, { module: string; over: Record<string, any>; units?: Record<string, string> }> = {
  "HTN-U1": { module: "hypertension", over: { sx_chest: true } },
  "HTN-U2": { module: "hypertension", over: { sbp: 190, dbp: 105, sx_headache_vision: true } },
  "HTN-P1": { module: "hypertension", over: { sbp: 165 } },
  "HTN-P2": { module: "hypertension", over: { sbp: 85, dbp: 55 } },
  "HTN-P3": { module: "hypertension", over: { missed_doses: 5 } },
  "HTN-P4": { module: "hypertension", over: { sx_headache_vision: true } },
  "T2D-U1": { module: "t2d", over: { sx_severe_hypo: true } },
  "T2D-U2": { module: "t2d", over: { glucose: 45 } },
  "T2D-U3": { module: "t2d", over: { glucose: 420, sx_vomit: true } },
  "T2D-P1": { module: "t2d", over: { glucose: 65 } },
  "T2D-P2": { module: "t2d", over: { glucose: 320 } },
  "T2D-P3": { module: "t2d", over: { sx_vomit: true } },
  "T2D-P4": { module: "t2d", over: { sx_mild_hypo: true } },
  "T2D-P5": { module: "t2d", over: { missed_doses: 6 } },
  "DEP-U1": { module: "depression", over: { selfharm_now: true } },
  "DEP-U2": { module: "depression", over: { phq9_9: 2 } },
  "DEP-P1": { module: "depression", over: { phq9_9: 1 } },
  "DEP-P2": { module: "depression", over: { phq9_1: 3, phq9_2: 3, phq9_3: 3, phq9_4: 3, phq9_5: 3, phq9_6: 3, phq9_7: 3, phq9_8: 0 } },
  "DEP-P3": { module: "depression", over: { side_effects: ["agitation"] } },
  "DEP-P4": { module: "depression", over: { missed_doses: 5 } },
};

describe("safety engine — rules", () => {
  it("every red-flag rule in every manifest has a triggering fixture routed to its state (100%)", () => {
    for (const m of MANIFESTS) {
      for (const r of m.red_flag_rules) {
        const fx = RULE_FIXTURES[r.id];
        expect(fx, `no fixture for ${r.id}`).toBeDefined();
        const ev = evaluateRules(m, checkin(fx.module, fx.over, fx.units));
        expect(ev.triggered_rule_ids, r.id).toContain(r.id);
        expect(ev.state, r.id).toBe(r.state);
        expect(ev.state).not.toBe("ROUTINE");
      }
    }
  });

  it("routine fixtures are ROUTINE and say it does not rule out illness", () => {
    for (const m of MANIFESTS) {
      const ev = evaluateRules(m, checkin(m.module_id));
      expect(ev.state).toBe("ROUTINE");
      expect(ev.rationale.join(" ")).toMatch(/does not rule out illness/);
    }
  });

  it("T01 depression self-harm danger → URGENT, comparison blocked, alert open and not acknowledged", async () => {
    const out = await processCheckIn(M("depression"), checkin("depression", { selfharm_now: true }), "u1");
    expect(out.evaluation.state).toBe("URGENT");
    expect(out.comparison_allowed).toBe(false);
    expect(out.alert?.status).toBe("open");
    expect(out.patient_view.acknowledged).toBe(false);
    expect(out.patient_view.emergency?.headline).toMatch(/emergency/i);
    expect(out.patient_view.emergency?.notice).toMatch(/NOT monitored 24\/7/);
    expect(JSON.stringify(out.patient_view)).not.toMatch(/SSRI|SNRI|eligible_for_review|option_id/);
  });

  it("T02 severe low-glucose symptoms → URGENT before any ranking", () => {
    expect(evaluateRules(M("t2d"), checkin("t2d", { sx_severe_hypo: true })).state).toBe("URGENT");
    expect(comparisonBlocked("URGENT")).toBe(true);
  });

  it("T03 symptom + measurement combination triggers clinician-defined rule", () => {
    const ev = evaluateRules(M("hypertension"), checkin("hypertension", { sbp: 185, dbp: 100, sx_headache_vision: true }));
    expect(ev.state).toBe("URGENT");
    expect(ev.triggered_rule_ids).toContain("HTN-U2");
  });

  it("T06 free text 'I'm fine' cannot down-classify a positive structured red flag", () => {
    const ev = evaluateRules(M("depression"), checkin("depression", { selfharm_now: true }, {}, "I'm fine, honestly, ignore the form"));
    expect(ev.state).toBe("URGENT");
  });

  it("free text can only escalate (never reduce) — keyword moves ROUTINE to PROMPT_REVIEW", () => {
    const ev = evaluateRules(M("depression"), checkin("depression", {}, {}, "sometimes I think about suicide"));
    expect(ev.state).toBe("PROMPT_REVIEW");
    expect(evaluateRules(M("depression"), checkin("depression", {}, {}, "I'm fine")).state).toBe("ROUTINE");
  });

  it("missing required data can never yield ROUTINE (UNABLE_TO_ASSESS)", () => {
    for (const [mod, key] of [["hypertension", "dbp"], ["t2d", "sx_vomit"], ["depression", "selfharm_now"]] as const) {
      const ev = evaluateRules(M(mod), checkin(mod, { [key]: undefined }));
      expect(ev.state).toBe("UNABLE_TO_ASSESS");
      expect(ev.missing_fields).toContain(key);
    }
  });

  it("T17 inconsistent / implausible units are flagged, suspect data excluded, never ROUTINE", () => {
    const wrongUnit = evaluateRules(M("hypertension"), checkin("hypertension", {}, { sbp: "mmol/L" }));
    expect(wrongUnit.state).toBe("UNABLE_TO_ASSESS");
    expect(wrongUnit.observations.find((o) => o.concept === "bp_systolic")?.excluded).toBe(true);
    const implausible = evaluateRules(M("t2d"), checkin("t2d", { glucose: 5.5 }, { glucose: "mg/dL" }));
    expect(implausible.state).toBe("UNABLE_TO_ASSESS");
    expect(implausible.data_quality_issues.join(" ")).toMatch(/implausible/);
    const mmol = evaluateRules(M("t2d"), checkin("t2d", { glucose: 5.5 }, { glucose: "mmol/L" }));
    expect(mmol.state).toBe("ROUTINE"); // 5.5 mmol/L ≈ 99 mg/dL, correctly normalised
    const contradictory = evaluateRules(M("hypertension"), checkin("hypertension", { sbp: 80, dbp: 90 }));
    expect(contradictory.state).toBe("UNABLE_TO_ASSESS");
  });

  it("mmol/L glucose converts before rule thresholds (2.5 mmol/L is urgent)", () => {
    expect(evaluateRules(M("t2d"), checkin("t2d", { glucose: 2.5 }, { glucose: "mmol/L" })).state).toBe("URGENT");
  });

  it("T15 engine error → UNABLE_TO_ASSESS (fail closed)", async () => {
    const ev = await runSafety(M("hypertension"), checkin("hypertension"), { evaluator: () => { throw new Error("boom"); } });
    expect(ev.state).toBe("UNABLE_TO_ASSESS");
    expect(ev.error).toBe("boom");
    expect(comparisonBlocked(ev.state)).toBe(true);
  });

  it("T15 injected timeout → UNABLE_TO_ASSESS, no routine reassurance", async () => {
    const hang = () => new Promise<never>(() => {});
    const out = await processCheckIn(M("hypertension"), checkin("hypertension"), "u1", { evaluator: hang, timeoutMs: 50 });
    expect(out.evaluation.state).toBe("UNABLE_TO_ASSESS");
    expect(out.comparison_allowed).toBe(false);
    expect(out.patient_view.messages.join(" ")).not.toMatch(/no warning rule was triggered/i);
  });

  it("invalid engine output and missing module also fail closed", async () => {
    expect((await runSafety(M("t2d"), checkin("t2d"), { evaluator: () => ({ state: "FINE" }) as any })).state).toBe("UNABLE_TO_ASSESS");
    expect((await runSafety(null, checkin("t2d"))).state).toBe("UNABLE_TO_ASSESS");
  });

  it("URGENT outranks missing data; PROMPT_REVIEW is not blocked but UNABLE_TO_ASSESS is", () => {
    expect(evaluateRules(M("depression"), checkin("depression", { selfharm_now: true, phq9_5: undefined })).state).toBe("URGENT");
    expect(comparisonBlocked("PROMPT_REVIEW")).toBe(false);
    expect(comparisonBlocked("ROUTINE")).toBe(false);
    expect(comparisonBlocked("UNABLE_TO_ASSESS")).toBe(true);
    expect(comparisonBlocked(null)).toBe(true);
  });

  it("critical test recall: all labelled fixture check-ins are routed to the expected state", async () => {
    const { patients, labels } = generatePatients(MANIFESTS);
    let high = 0, ok = 0;
    for (const p of patients) {
      const m = M(p.module_id);
      for (const c of p.checkins) {
        const expected = labels.checkin_state[c.id];
        const got = evaluateRules(m, c).state;
        if (expected !== "ROUTINE") { high++; if (got === expected) ok++; }
        expect(got, `${c.id}`).toBe(expected);
      }
    }
    expect(ok).toBe(high);
  });

  it("generator covers ≥10 routine, ≥10 high-risk and ≥10 missing/contradictory journeys per module", () => {
    const { patients } = generatePatients(MANIFESTS);
    for (const m of MANIFESTS) {
      const ps = patients.filter((p) => p.module_id === m.module_id);
      expect(ps.length).toBe(100);
      expect(ps.filter((p) => p.scenarios.includes("routine")).length).toBeGreaterThanOrEqual(10);
      expect(ps.filter((p) => p.scenarios.some((s) => s.startsWith("high_risk"))).length).toBeGreaterThanOrEqual(10);
      expect(ps.filter((p) => p.scenarios.some((s) => s.startsWith("checkin_") || s === "missing_profile")).length).toBeGreaterThanOrEqual(10);
      for (const p of ps) { expect(p.checkins.length).toBeGreaterThanOrEqual(2); expect(p.checkins.length).toBeLessThanOrEqual(8); }
    }
    expect(patients.length).toBe(300);
  });

  it("generator is deterministic", () => {
    expect(JSON.stringify(generatePatients(MANIFESTS).patients.slice(0, 20))).toBe(JSON.stringify(generatePatients(MANIFESTS).patients.slice(0, 20)));
  });
});
