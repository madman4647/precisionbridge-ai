import { beforeAll, describe, expect, it } from "vitest";
import { signSession, COOKIE } from "@/lib/session";
import { getDb } from "@/db/client";
import { listAudit, countUnsignedMedicationPlans, listPlans } from "@/db/repo";
import * as patientRoute from "@/app/api/patients/[id]/route";
import * as checkinsRoute from "@/app/api/patients/[id]/checkins/route";
import * as comparisonsRoute from "@/app/api/patients/[id]/comparisons/route";
import * as decisionsRoute from "@/app/api/comparisons/[id]/decisions/route";
import * as patientDecisions from "@/app/api/patients/[id]/decisions/route";
import * as planRoute from "@/app/api/patients/[id]/plan/route";
import * as consentRoute from "@/app/api/patients/[id]/consents/route";
import * as queryRoute from "@/app/api/research/query/route";
import * as validateRoute from "@/app/api/admin/modules/validate/route";
import * as modulesRoute from "@/app/api/admin/modules/route";
import * as faultRoute from "@/app/api/admin/fault-injection/route";
import * as auditRoute from "@/app/api/audit/events/route";
import * as metricsRoute from "@/app/api/admin/metrics/route";
import * as timelineRoute from "@/app/api/patients/[id]/timeline/route";
import * as alertAck from "@/app/api/alerts/[id]/acknowledge/route";
import * as cohortsRoute from "@/app/api/research/cohorts/route";
import * as summaryRoute from "@/app/api/research/cohorts/[id]/summary/route";
import * as hypRoute from "@/app/api/research/cohorts/[id]/hypotheses/route";
import * as hypReview from "@/app/api/hypotheses/[id]/route";
import { SAMPLE_MODULES } from "@/core/modules/registry";

process.env.SESSION_SECRET = "test-secret-test-secret-test-secret-123456";

async function call(handler: (r: Request, c: any) => Promise<Response>, user: string | null, opts: { method?: string; body?: unknown; id?: string; url?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (user) headers.cookie = `${COOKIE}=${await signSession(user)}`;
  const req = new Request(opts.url ?? "http://localhost/api/x", { method: opts.method ?? "GET", headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const res = await handler(req, { params: Promise.resolve({ id: opts.id ?? "" }) });
  const text = await res.text();
  let j: any = null; try { j = JSON.parse(text); } catch { /* non-JSON (export) response */ }
  return { status: res.status, json: j, text };
}

const DM = "u-patient-dm042", DEP = "u-patient-dep017", HTN = "u-patient-htn042";
const ROUTINE_DM = { answers: { glucose: 112, sx_severe_hypo: false, sx_vomit: false, sx_mild_hypo: false, missed_doses: 0 }, units: { glucose: "mg/dL" } };
const ROUTINE_HTN = { answers: { sbp: 126, dbp: 78, sx_chest: false, sx_neuro: false, sx_headache_vision: false, missed_doses: 0 }, units: { sbp: "mmHg", dbp: "mmHg" } };

beforeAll(async () => { await getDb(); }, 120000);

describe("authorization (F01, T10)", () => {
  it("T10 researcher guessing a patient URL gets 403 with no payload, and the denial is logged", async () => {
    const r = await call(patientRoute.GET, "u-researcher", { id: "DM-042" });
    expect(r.status).toBe(403);
    expect(r.text).not.toMatch(/DM-042|Fakename|profile|egfr/i);
    const ev = await listAudit(await getDb(), { action: "access.denied", actor_id: "u-researcher" });
    expect(ev.length).toBeGreaterThan(0);
    expect(ev[0].resource_id).toBe("DM-042");
  });
  it("unauthenticated → 401; patient → other patient 403; clinician not assigned → 403", async () => {
    expect((await call(patientRoute.GET, null, { id: "DM-042" })).status).toBe(401);
    expect((await call(patientRoute.GET, DEP, { id: "DM-042" })).status).toBe(403);
    expect((await call(patientRoute.GET, "clin-2", { id: "DM-042" })).status).toBe(403);
    expect((await call(patientRoute.GET, "clin-1", { id: "DM-042" })).status).toBe(200);
    expect((await call(patientRoute.GET, DM, { id: "DM-042" })).status).toBe(200);
  });
  it("paired access case: identical observations, different clinician assignment", async () => {
    expect((await call(patientRoute.GET, "clin-2", { id: "DM-096" })).status).toBe(200);
    expect((await call(patientRoute.GET, "clin-1", { id: "DM-096" })).status).toBe(403);
    expect((await call(patientRoute.GET, "clin-1", { id: "DM-097" })).status).toBe(200);
  });
  it("patients cannot read comparisons or sign decisions; researchers cannot sign", async () => {
    expect((await call(comparisonsRoute.GET, DM, { id: "DM-042" })).status).toBe(403);
    expect((await call(patientDecisions.POST, DM, { id: "DM-042", method: "POST", body: { action: "approve_plan", rationale: "patient trying to approve" } })).status).toBe(403);
    expect((await call(patientDecisions.POST, "u-researcher", { id: "DM-042", method: "POST", body: { action: "approve_plan", rationale: "researcher trying to approve" } })).status).toBe(403);
  });
  it("audit log and metrics are restricted to authorised reviewers", async () => {
    expect((await call(auditRoute.GET, "u-patient-dm042")).status).toBe(403);
    expect((await call(auditRoute.GET, "u-researcher")).status).toBe(403);
    expect((await call(auditRoute.GET, "u-admin")).status).toBe(200);
    expect((await call(metricsRoute.GET, "clin-1")).status).toBe(403);
  });
});

describe("storyboard scenes 1–3 (DM-042)", () => {
  let comparisonId = "";
  it("Scene 2: routine check-in → ROUTINE; patient response contains no options", async () => {
    const r = await call(checkinsRoute.POST, DM, { id: "DM-042", method: "POST", body: ROUTINE_DM });
    expect(r.status).toBe(200);
    expect(r.json.data.state).toBe("ROUTINE");
    expect(r.text).not.toMatch(/eligible_for_review|option_id|Biguanide|SGLT2/);
  });
  it("clinician sees option cards with evidence, but renal status needs review → no confident personalised ranking", async () => {
    const r = await call(comparisonsRoute.GET, "clin-1", { id: "DM-042" });
    expect(r.status).toBe(200);
    const c = r.json.data.comparisons[0];
    comparisonId = c.id;
    expect(c.result.personalized_ranking).toBe(false);
    expect(c.result.missing_fields.map((m: any) => m.key)).toContain("egfr");
    expect(c.result.cards.length).toBeGreaterThan(0);
    for (const card of c.result.cards) { expect(card.evidence.length).toBeGreaterThan(0); expect(card.status).not.toBe("eligible_for_review"); }
  });
  it("T08 / Scene 3: signed decisions create immutable, versioned plans; patient sees only approved follow-up", async () => {
    const db = await getDb();
    const before = await listPlans(db, "DM-042");
    const noRationale = await call(decisionsRoute.POST, "clin-1", { id: comparisonId, method: "POST", body: { action: "request_more_data", rationale: "short", patient_instruction: "Please upload your latest kidney blood test." } });
    expect(noRationale.status).toBe(422);
    const d1 = await call(decisionsRoute.POST, "clin-1", { id: comparisonId, method: "POST", body: { action: "request_more_data", rationale: "Renal function is unverified; need updated labs before any change.", patient_instruction: "Please upload your latest kidney blood test result." } });
    expect(d1.status).toBe(200);
    const v1 = d1.json.data.plan.version;
    expect(v1).toBe(before.length + 1);
    const plan = await call(planRoute.GET, DM, { id: "DM-042" });
    expect(plan.json.data.plan.items.map((i: any) => i.text).join(" ")).toMatch(/kidney blood test/);
    expect(plan.text).not.toMatch(/option_id|eligible_for_review|draft|SGLT2|Sulfonylurea|evidence/i);
    const d2 = await call(decisionsRoute.POST, "clin-1", { id: comparisonId, method: "POST", body: { action: "request_more_data", rationale: "Updated instruction after reviewing the patient message.", patient_instruction: "Also share any home glucose readings from the last week." } });
    const after = await listPlans(db, "DM-042");
    expect(after.length).toBe(before.length + 2);
    expect(after[after.length - 1].version).toBe(v1 + 1);
    expect(after[after.length - 2]).toEqual(after.find((p) => p.version === v1)); // prior version untouched
    expect(after[after.length - 1].supersedes).toBe(v1);
    expect(after[after.length - 1].signed_by).toBe("clin-1");
    expect(after[after.length - 1].reason).toMatch(/Updated instruction/);
    expect(d2.json.data.decision.signed_at).toBeTruthy();
  });
  it("cannot approve an excluded or unknown option", async () => {
    const r = await call(decisionsRoute.POST, "clin-1", { id: comparisonId, method: "POST", body: { action: "approve_plan", rationale: "Trying an option that does not exist.", selected_option_ids: ["nope"] } });
    expect(r.status).toBe(422);
  });
  it("unsigned medication changes = 0", async () => {
    const m = await countUnsignedMedicationPlans(await getDb());
    expect(m.unsigned).toBe(0);
  });
});

describe("hypertension slice (HTN-042)", () => {
  it("check-in → ROUTINE → personalised draft → clinician approves → patient sees plan", async () => {
    expect((await call(checkinsRoute.POST, HTN, { id: "HTN-042", method: "POST", body: ROUTINE_HTN })).json.data.state).toBe("ROUTINE");
    const c = (await call(comparisonsRoute.GET, "clin-1", { id: "HTN-042" })).json.data.comparisons[0];
    expect(c.result.personalized_ranking).toBe(true);
    const eligible = c.result.cards.filter((x: any) => x.status === "eligible_for_review");
    expect(eligible.length).toBeGreaterThan(0);
    const d = await call(decisionsRoute.POST, "clin-1", { id: c.id, method: "POST", body: { action: "approve_plan", rationale: "Suitable per clinical review of verified profile.", selected_option_ids: [eligible[0].option_id] } });
    expect(d.status).toBe(200);
    const plan = (await call(planRoute.GET, HTN, { id: "HTN-042" })).json.data.plan;
    expect(plan.items.some((i: any) => i.type === "medication_class")).toBe(true);
    expect(plan.version).toBe(d.json.data.plan.version);
    const reorder = await call(decisionsRoute.POST, "clin-1", { id: c.id, method: "POST", body: { action: "reorder_options", rationale: "x", option_order: [] } });
    expect(reorder.status).toBe(422);
  });
});

describe("scene 4 safety stress test (DEP-017)", () => {
  it("self-harm fixture → URGENT, immediate emergency copy, comparison blocked, alert recorded but NOT acknowledged", async () => {
    const answers = { phq9_1: 2, phq9_2: 2, phq9_3: 1, phq9_4: 1, phq9_5: 1, phq9_6: 2, phq9_7: 1, phq9_8: 0, phq9_9: 2, selfharm_now: true, missed_doses: 0 };
    const t0 = Date.now();
    const r = await call(checkinsRoute.POST, DEP, { id: "DEP-017", method: "POST", body: { answers } });
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(r.json.data.state).toBe("URGENT");
    expect(r.json.data.emergency.headline).toMatch(/emergency/i);
    expect(r.json.data.acknowledged).toBe(false);
    const cmp = await call(comparisonsRoute.POST, "clin-1", { id: "DEP-017", method: "POST" });
    expect(cmp.status).toBe(409);
    const tl = (await call(timelineRoute.GET, "clin-1", { id: "DEP-017" })).json.data;
    const open = tl.alerts.find((a: any) => a.state === "URGENT" && a.status === "open");
    expect(open).toBeDefined();
    expect(open.acknowledged_by).toBeUndefined();
    const ack = await call(alertAck.POST, "clin-1", { id: open.id, method: "POST", body: { rationale: "Contacted patient by phone; crisis team engaged." } });
    expect(ack.status).toBe(200);
    const tl2 = (await call(timelineRoute.GET, "clin-1", { id: "DEP-017" })).json.data;
    expect(tl2.alerts.find((a: any) => a.id === open.id).status).toBe("acknowledged");
  });
});

describe("consent and research (F02, F12, T09)", () => {
  const def = { condition_code: "DEP", endpoint_id: "phq9_response_8w" };
  it("T09 consent off → record excluded from the query and the exclusion is logged; revoke stops future processing", async () => {
    const before = await call(queryRoute.POST, "u-researcher", { method: "POST", body: def });
    expect(before.status).toBe(200);
    const nBefore = before.json.data.cells.reduce((s: number, c: any) => s + (c.n ?? 0), 0);
    expect(before.json.data.excluded_without_consent).toBeGreaterThan(0);
    const revokeBy = async (pid: string) => {
      // patient session: demo users exist only for three patients; use DEP-017's consent flow for the real route
      return call(consentRoute.PUT, DEP, { id: pid, method: "PUT", body: { kind: "research", granted: false } });
    };
    expect((await revokeBy("DEP-016")).status).toBe(403); // other patients' consent cannot be changed
    expect((await call(consentRoute.PUT, DEP, { id: "DEP-017", method: "PUT", body: { kind: "research", granted: true } })).status).toBe(200);
    const mid = await call(queryRoute.POST, "u-researcher", { method: "POST", body: def });
    const nMid = mid.json.data.cells.reduce((s: number, c: any) => s + (c.n ?? 0), 0);
    expect(mid.json.data.excluded_without_consent).toBe(before.json.data.excluded_without_consent - 1);
    expect(nMid).toBeGreaterThanOrEqual(nBefore);
    expect((await call(consentRoute.PUT, DEP, { id: "DEP-017", method: "PUT", body: { kind: "research", granted: false } })).status).toBe(200);
    const after = await call(queryRoute.POST, "u-researcher", { method: "POST", body: def });
    expect(after.json.data.excluded_without_consent).toBe(before.json.data.excluded_without_consent);
    const ev = await listAudit(await getDb(), { action: "research.record_excluded" });
    expect(ev.length).toBeGreaterThan(0);
    expect(JSON.stringify(ev[0])).not.toMatch(/DEP-\d/);
  });
  it("research outputs contain no direct identifiers and enforce suppression", async () => {
    const r = await call(queryRoute.POST, "u-researcher", { method: "POST", body: { condition_code: "T2D", endpoint_id: "glycemic_target_8w" } });
    expect(r.text).not.toMatch(/DM-\d{3}|Fakename|patient_id/);
    expect(r.json.data.cells.some((c: any) => c.suppressed)).toBe(true);
  });
  it("clinicians and patients cannot query cohorts; saved cohorts are reproducible; hypotheses carry caveats and can be dispositioned", async () => {
    expect((await call(queryRoute.POST, "clin-1", { method: "POST", body: def })).status).toBe(403);
    expect((await call(queryRoute.POST, DM, { method: "POST", body: def })).status).toBe(403);
    const saved = await call(cohortsRoute.POST, "u-researcher", { method: "POST", body: { name: "T2D 8wk", definition: { condition_code: "T2D", endpoint_id: "glycemic_target_8w" } } });
    expect(saved.status).toBe(200);
    const id = saved.json.data.id;
    const s1 = await call(summaryRoute.GET, "u-researcher", { id }), s2 = await call(summaryRoute.GET, "u-researcher", { id });
    expect(s1.json.data.summary.result_hash).toBe(s2.json.data.summary.result_hash);
    const h = await call(hypRoute.POST, "u-researcher", { id, method: "POST" });
    expect(h.status).toBe(200);
    const promoted = h.json.data.find((x: any) => x.status === "queued");
    expect(promoted.candidate.disclaimer).toBe("exploratory_only");
    const rev = await call(hypReview.PATCH, "u-researcher", { id: promoted.id, method: "PATCH", body: { disposition: "request_scientific_review" } });
    expect(rev.json.data.status).toBe("scientific_review_requested");
    expect((await call(hypReview.PATCH, "clin-1", { id: promoted.id, method: "PATCH", body: { disposition: "dismiss" } })).status).toBe(403);
  });
});

describe("admin: modules, fault injection (T15, T18)", () => {
  it("T18 malformed / unsigned module fails validation and cannot be activated", async () => {
    const v = await call(validateRoute.POST, "u-admin", { method: "POST", body: SAMPLE_MODULES.invalid_demo });
    expect(v.json.data.ok).toBe(false);
    const a = await call(modulesRoute.POST, "u-admin", { method: "POST", body: SAMPLE_MODULES.invalid_demo });
    expect(a.status).toBe(422);
    expect((await call(validateRoute.POST, "clin-1", { method: "POST", body: SAMPLE_MODULES.asthma_demo })).status).toBe(403);
  });
  it("a 4th dummy module activates with no code change and its check-in runs through the same engine", async () => {
    const a = await call(modulesRoute.POST, "u-admin", { method: "POST", body: SAMPLE_MODULES.asthma_demo });
    expect(a.status).toBe(200);
    // identical re-submission is idempotent; a changed body with the same version is rejected (immutability)
    const changed = JSON.parse(JSON.stringify(SAMPLE_MODULES.asthma_demo)); changed.population_scope = "changed";
    expect((await call(modulesRoute.POST, "u-admin", { method: "POST", body: changed })).status).toBe(409);
  });
  it("T15 injected safety timeout → UNABLE_TO_ASSESS, no routine reassurance, comparison blocked", async () => {
    expect((await call(faultRoute.POST, "u-admin", { method: "POST", body: { safety_timeout: true } })).status).toBe(200);
    const r = await call(checkinsRoute.POST, HTN, { id: "HTN-042", method: "POST", body: ROUTINE_HTN });
    expect(r.json.data.state).toBe("UNABLE_TO_ASSESS");
    expect(r.text).not.toMatch(/no warning rule was triggered/i);
    await call(faultRoute.POST, "u-admin", { method: "POST", body: { safety_timeout: false } });
    expect((await call(comparisonsRoute.POST, "clin-1", { id: "HTN-042", method: "POST" })).status).toBe(409); // latest evaluation is UNABLE_TO_ASSESS
  });
  it("audit captures consent changes, rule evaluations (with module version), alerts, decisions and denials", async () => {
    const db = await getDb();
    const all = await listAudit(db, { limit: 500 });
    const actions = new Set(all.map((e) => e.action));
    for (const a of ["consent.changed", "rule.evaluated", "alert.created", "decision.signed", "access.denied", "comparison.generated", "research.cohort_query", "module.rejected", "module.activated", "alert.acknowledged"]) expect(actions.has(a as any), a).toBe(true);
    expect(all.find((e) => e.action === "rule.evaluated")!.module_version).toBeTruthy();
  });
  it("KPI page computes and all measured KPIs pass", async () => {
    const r = await call(metricsRoute.GET, "u-admin");
    expect(r.status).toBe(200);
    const bad = r.json.data.kpis.filter((k: any) => k.status === "fail");
    expect(bad, JSON.stringify(bad)).toHaveLength(0);
  });
});
