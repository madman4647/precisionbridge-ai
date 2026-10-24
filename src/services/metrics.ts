import { countAudit, countUnsignedMedicationPlans, listModuleVersions, listPatients } from "@/db/repo";
import * as t from "@/db/schema";
import { sql } from "drizzle-orm";
import { guard, ok, makeCtx, type Ctx } from "./context";
import { loadBundled } from "@/core/modules/registry";
import { evaluateRules } from "@/core/safety/engine";
import { buildComparison } from "@/core/options/pipeline";
import { generatePatients } from "@/db/seed/generator";
import { summarizeCohort } from "@/core/research/cohort";
import { validateManifest } from "@/core/modules/validator";
import { getPatientDetail } from "./patients";
import { threshold } from "./research";

export interface Kpi { id: string; name: string; definition: string; target: string; value: string; status: "pass" | "fail" | "not_measured"; caveat: string; source: string }

const count = async (ctx: Ctx, table: any) => Number((await ctx.db.select({ n: sql<number>`count(*)::int` }).from(table))[0]?.n ?? 0);

/** PRD §13 KPIs computed from the labelled fixtures and the audit log (never presented as real-world results). */
export async function computeKpis(ctx: Ctx) {
  const g = await guard(ctx, "metrics.read", { type: "metrics" });
  if (!g.ok) return g;
  const manifests = loadBundled();
  const { patients, labels } = generatePatients(manifests);
  const byId = new Map(manifests.map((m) => [m.module_id, m]));
  const kpis: Kpi[] = [];

  let high = 0, routed = 0, evalMs = 0, evals = 0;
  for (const p of patients) for (const c of p.checkins) {
    const exp = labels.checkin_state[c.id];
    const t0 = performance.now(); const got = evaluateRules(byId.get(p.module_id)!, c).state; evalMs += performance.now() - t0; evals++;
    if (exp !== "ROUTINE") { high++; if (got === exp) routed++; }
  }
  kpis.push({ id: "critical_recall", name: "Critical test recall", definition: "High-risk synthetic fixtures correctly routed / total labelled high-risk fixtures", target: "100%", value: `${routed}/${high} (${((routed / high) * 100).toFixed(1)}%)`, status: routed === high ? "pass" : "fail", caveat: "Not a real-world sensitivity estimate.", source: "Labelled generator fixtures (labels stored outside app data)" });

  const med = await countUnsignedMedicationPlans(ctx.db);
  kpis.push({ id: "autonomous_changes", name: "Autonomous medication changes", definition: "Generated/executed medication changes not signed by a clinician", target: "0", value: `${med.unsigned} of ${med.total_med_plan_items} medication plan items`, status: med.unsigned === 0 ? "pass" : "fail", caveat: "Architectural invariant: only clinician-signed decisions create plan items.", source: "care_plans × decisions" });

  let cards = 0, cited = 0, withheld = 0;
  const abstain = { total: 0, ok: 0 };
  for (const p of patients) {
    const m = byId.get(p.module_id)!;
    const r = buildComparison({ manifest: m, safety_state: "ROUTINE", profile: p.profile });
    cards += r.cards.length; withheld += r.withheld.length;
    cited += r.cards.filter((c) => c.evidence.length > 0 && c.evidence.every((e) => e.guideline_source_id && e.published && e.rationale && e.applicable_population && e.jurisdiction)).length;
    const keyFor: Record<string, string> = { egfr_missing: "egfr", egfr_unverified: "egfr", allergy_unknown: "allergy_status" };
    for (const s of p.scenarios) {
      const key = keyFor[s];
      if (!key || !m.required_profile_fields.some((f) => f.key === key && f.critical)) continue; // only fixtures whose module treats the field as critical
      abstain.total++;
      if (!r.personalized_ranking && r.missing_fields.some((f) => f.key === key)) abstain.ok++;
    }
  }
  kpis.push({ id: "evidence_coverage", name: "Evidence coverage", definition: "Option cards with valid guideline source, version and rationale / all displayed cards", target: "100%", value: `${cited}/${cards} (${withheld} withheld)`, status: cited === cards ? "pass" : "fail", caveat: "Sources still require clinical correctness review.", source: "Option pipeline over all 300 synthetic profiles" });
  kpis.push({ id: "critical_field_abstention", name: "Critical-field abstention", definition: "Missing critical-data fixtures correctly restricted / all such fixtures", target: "100%", value: `${abstain.ok}/${abstain.total}`, status: abstain.ok === abstain.total ? "pass" : "fail", caveat: "Based on the defined completeness rules.", source: "Profile fixtures with missing / unverified critical fields" });

  const ops = { checkins: await count(ctx, t.checkins), evals: await count(ctx, t.riskEvaluations), alerts: await count(ctx, t.alerts), decisions: await count(ctx, t.decisions), consents: await count(ctx, t.consents) };
  const aud = { checkins: await countAudit(ctx.db, "checkin.submitted"), evals: await countAudit(ctx.db, "rule.evaluated"), alerts: await countAudit(ctx.db, "alert.created"), decisions: await countAudit(ctx.db, "decision.signed"), consents: await countAudit(ctx.db, "consent.changed") };
  const totalOps = Object.values(ops).reduce((a, b) => a + b, 0);
  const audited = (Object.keys(ops) as (keyof typeof ops)[]).reduce((s, k) => s + Math.min(ops[k], aud[k]), 0);
  kpis.push({ id: "audit_capture", name: "Audit capture", definition: "Critical operations with a recorded audit event / all critical operations", target: "100%", value: `${audited}/${totalOps}`, status: audited === totalOps ? "pass" : "fail", caveat: "Prototype telemetry target; counts check-ins, evaluations, alerts, decisions and consent changes.", source: "Audit log vs entity tables" });

  // Research isolation: probe the real service as a researcher
  const probeIds = patients.slice(0, 5).map((p) => p.id);
  let leaked = 0;
  for (const id of probeIds) { const res = await getPatientDetail(makeCtx(ctx.db, { id: "metrics-probe", role: "researcher", display_name: "probe" }), id); if (res.ok) leaked++; }
  const denied = await countAudit(ctx.db, "access.denied", "denied");
  kpis.push({ id: "research_isolation", name: "Research isolation", definition: "Unauthorised direct-identifier access attempts returning protected data", target: "0", value: `${leaked} of ${probeIds.length} live probes (${denied} denials logged in total)`, status: leaked === 0 ? "pass" : "fail", caveat: "Requires penetration/privacy review before deployment.", source: "Live researcher probes of patient endpoints" });

  const stored = await listModuleVersions(ctx.db);
  const active = stored.filter((m) => m.status === "active");
  const valid = active.filter((m) => validateManifest(m.manifest).ok).length;
  kpis.push({ id: "portability", name: "Disease module portability", definition: "Active modules using the common manifest and existing engines", target: "3/3", value: `${valid}/${active.length} active modules validate`, status: valid === active.length && active.length >= 3 ? "pass" : "fail", caveat: "Does not establish unlimited disease coverage.", source: "Module registry" });

  const { records } = { records: patients.filter((p) => p.consent_research).map((p) => p.research) };
  let reproducible = 0, runs = 0;
  for (const m of manifests) {
    const def = { condition_code: m.condition_code, endpoint_id: m.outcome_definitions[0].id, window_weeks: m.outcome_definitions[0].window_weeks };
    const a = summarizeCohort(records, def, { threshold: threshold() }), b = summarizeCohort([...records].reverse(), def, { threshold: threshold() });
    runs++; if (a.result_hash === b.result_hash) reproducible++;
  }
  kpis.push({ id: "reproducibility", name: "Research reproducibility", definition: "Re-running the same cohort definition yields identical filters/counts/results", target: "100%", value: `${reproducible}/${runs} cohorts identical`, status: reproducible === runs ? "pass" : "fail", caveat: "On deterministic seed data.", source: "Cohort engine run twice per module" });

  kpis.push({ id: "e2e", name: "End-to-end completion", definition: "Golden-path scenarios completed from check-in through clinician review and aggregate research", target: ">=95%", value: "Run `npm run test:e2e` (Playwright storyboard scenes 1-5)", status: "not_measured", caveat: "Excludes clinical effectiveness.", source: "tests/e2e/storyboard.spec.ts" });
  kpis.push({ id: "usability", name: "Clinician usability", definition: "Median task time vs manually preparing an equivalent synthetic case packet", target: ">=20% faster", value: "Not measured - requires a timed user test", status: "not_measured", caveat: "Pilot target; run a timed user test and report the actual result.", source: "n/a" });

  const perf = { safety_ms: evalMs / Math.max(1, evals) };
  kpis.push({ id: "perf_safety", name: "Performance: safety result", definition: "Mean time per deterministic safety evaluation on seed data", target: "< 2 s (p95)", value: `${perf.safety_ms.toFixed(3)} ms mean over ${evals} evaluations`, status: perf.safety_ms < 2000 ? "pass" : "fail", caveat: "Engine time only; not a p95 over network/hardware.", source: "In-process timing" });

  const pts = await listPatients(ctx.db);
  return ok({ kpis, generated_at: new Date().toISOString(), counts: { patients: pts.length, ...ops }, audit_counts: aud });
}
