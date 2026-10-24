import { z } from "zod";
import catalog from "@/modules-data/evidence-catalog.json";
import trialSnapshot from "@/modules-data/trial-snapshot.json";
import { consentMap, getActiveManifest, getCohort, getHypothesis, listCohorts, listHypotheses, listModuleVersions, listResearchRows, saveCohort, setHypothesis, upsertHypothesis } from "@/db/repo";
import { audit, fail, guard, ok, type Ctx } from "./context";
import { definitionHash, type CohortDefinition, type ResearchRecord } from "@/core/research/cohort";
import { runCohort, runHypotheses, runTrialPrescreen } from "@/core/orchestrator/researchWing";
import { TrialSnapshotSchema } from "@/core/trials/prescreen";
import { deterministicCohortSummary, plainCohortSummary } from "./llm";
import type { CohortRecord, HypothesisRecord } from "@/lib/models";

export const threshold = () => Math.max(1, Number(process.env.SMALL_CELL_THRESHOLD ?? 10) || 10);
export const MAX_QUERIES_PER_HOUR = 60;

const DefSchema = z.object({
  condition_code: z.string().min(1),
  endpoint_id: z.string().min(1),
  treatment_class: z.string().nullish(),
  baseline_severity: z.enum(["mild", "moderate", "severe"]).nullish(),
});

/**
 * Data governance gate (F12): only research-consented records leave this function, and only as de-identified rows
 * (pseudo id, bands, outcomes). Patient ids never cross this boundary. Excluded counts are logged without identities.
 */
export async function consentedRecords(ctx: Ctx, why: string): Promise<{ records: ResearchRecord[]; excluded: number }> {
  const [rows, consents] = await Promise.all([listResearchRows(ctx.db), consentMap(ctx.db)]);
  const records: ResearchRecord[] = [];
  let excluded = 0;
  for (const r of rows) {
    if (consents.get(r.patient_id)?.research === true) records.push(r.record);
    else excluded++;
  }
  if (excluded) await audit(ctx, { action: "research.record_excluded", outcome: "denied", actor_id: ctx.actor?.id ?? "system", actor_role: ctx.actor?.role ?? "system", resource_type: "research_records", details: { reason: "research consent not granted", excluded_count: excluded, purpose: why } });
  return { records, excluded };
}

async function resolveDefinition(ctx: Ctx, input: unknown): Promise<{ def: CohortDefinition } | { error: string }> {
  const p = DefSchema.safeParse(input);
  if (!p.success) return { error: "invalid cohort definition" };
  const modules = await listModuleVersions(ctx.db);
  const active = modules.filter((m) => m.status === "active");
  const mod = active.find((m) => m.manifest.condition_code === p.data.condition_code);
  if (!mod) return { error: "unknown condition" };
  const ep = mod.manifest.outcome_definitions.find((o) => o.id === p.data.endpoint_id);
  if (!ep) return { error: "endpoint must be one of the module's defined outcomes (single, explicit endpoint)" };
  if (p.data.treatment_class && !mod.manifest.treatment_option_cards.some((c) => c.id === p.data.treatment_class)) return { error: "unknown treatment class" };
  return { def: { condition_code: p.data.condition_code, endpoint_id: ep.id, window_weeks: ep.window_weeks, treatment_class: p.data.treatment_class ?? null, baseline_severity: p.data.baseline_severity ?? null } };
}

export async function runCohortQuery(ctx: Ctx, input: unknown) {
  const g = await guard(ctx, "research.query", { type: "cohort" });
  if (!g.ok) return g;
  const r = await resolveDefinition(ctx, input);
  if ("error" in r) return fail(422, r.error);
  const { records, excluded } = await consentedRecords(ctx, "cohort_query");
  const summary = runCohort(records, r.def, { threshold: threshold(), excluded_without_consent: excluded });
  await audit(ctx, { action: "research.cohort_query", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "cohort_definition", resource_id: summary.definition_hash, details: { definition: r.def, suppressed_cells: summary.suppressed_cell_count, result_hash: summary.result_hash } });
  const plain = await plainCohortSummary(ctx, deterministicCohortSummary(summary));
  return ok({ ...summary, plain_summary: plain });
}

export async function saveCohortDefinition(ctx: Ctx, name: string, input: unknown) {
  const g = await guard(ctx, "research.query", { type: "cohort" });
  if (!g.ok) return g;
  const r = await resolveDefinition(ctx, input);
  if ("error" in r) return fail(422, r.error);
  const hash = definitionHash(r.def);
  const rec: CohortRecord = { id: `coh_${hash}`, name: (name || "Untitled cohort").slice(0, 80), definition: r.def, hash, created_by: g.data.id, created_at: new Date().toISOString() };
  await saveCohort(ctx.db, rec);
  await audit(ctx, { action: "research.cohort_saved", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "cohort", resource_id: rec.id, details: { hash } });
  return ok(rec);
}

export async function listSavedCohorts(ctx: Ctx) {
  const g = await guard(ctx, "research.query", { type: "cohort" });
  if (!g.ok) return g;
  return ok(await listCohorts(ctx.db));
}

export async function getCohortSummary(ctx: Ctx, id: string) {
  const g = await guard(ctx, "research.query", { type: "cohort", id });
  if (!g.ok) return g;
  const c = await getCohort(ctx.db, id);
  if (!c) return fail(404, "not found");
  const { records, excluded } = await consentedRecords(ctx, "cohort_summary");
  const summary = runCohort(records, c.definition, { threshold: threshold(), excluded_without_consent: excluded });
  await audit(ctx, { action: "research.cohort_query", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "cohort", resource_id: id, details: { result_hash: summary.result_hash, saved: true } });
  return ok({ cohort: c, summary });
}

export async function generateHypothesesForCohort(ctx: Ctx, cohort_id: string) {
  const g = await guard(ctx, "research.hypothesis", { type: "hypothesis" });
  if (!g.ok) return g;
  const c = await getCohort(ctx.db, cohort_id);
  if (!c) return fail(404, "cohort not found");
  const { records } = await consentedRecords(ctx, "hypothesis_generation");
  const cands = runHypotheses(records, c.definition, { threshold: threshold(), catalog });
  for (const cand of cands) {
    const rec: HypothesisRecord = { id: cand.id, cohort_hash: c.hash, candidate: cand, status: cand.promoted ? "queued" : "not_promoted" };
    await upsertHypothesis(ctx.db, rec);
  }
  await audit(ctx, { action: "hypothesis.generated", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "cohort", resource_id: cohort_id, details: { candidates: cands.length, promoted: cands.filter((x) => x.promoted).length } });
  return ok(await listHypotheses(ctx.db, c.hash));
}

const Disposition = z.object({ disposition: z.enum(["dismiss", "needs_evidence", "request_scientific_review"]), note: z.string().max(500).optional() });
export async function reviewHypothesis(ctx: Ctx, id: string, body: unknown) {
  const g = await guard(ctx, "research.hypothesis", { type: "hypothesis", id });
  if (!g.ok) return g;
  const p = Disposition.safeParse(body);
  if (!p.success) return fail(422, "invalid disposition");
  const h = await getHypothesis(ctx.db, id);
  if (!h) return fail(404, "not found");
  if (h.status === "not_promoted") return fail(409, "Hypothesis was not promoted (small sample) and cannot be dispositioned.");
  const status = ({ dismiss: "dismissed", needs_evidence: "needs_evidence", request_scientific_review: "scientific_review_requested" } as const)[p.data.disposition];
  const next: HypothesisRecord = { ...h, status, reviewer: g.data.id, reviewed_at: new Date().toISOString(), note: p.data.note };
  await setHypothesis(ctx.db, next);
  await audit(ctx, { action: "hypothesis.reviewed", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "hypothesis", resource_id: id, details: { disposition: p.data.disposition, clinical_routing: "none" } });
  return ok(next);
}

export async function listHypothesesForCohort(ctx: Ctx, cohort_id: string) {
  const g = await guard(ctx, "research.hypothesis", { type: "hypothesis" });
  if (!g.ok) return g;
  const c = await getCohort(ctx.db, cohort_id);
  if (!c) return fail(404, "not found");
  return ok(await listHypotheses(ctx.db, c.hash));
}

export async function listTrialCandidates(ctx: Ctx, condition_code: string) {
  const g = await guard(ctx, "research.trial", { type: "trial" });
  if (!g.ok) return g;
  const { records } = await consentedRecords(ctx, "trial_candidate_list");
  return ok(records.filter((r) => r.condition_code === condition_code).slice(0, 40).map((r) => ({ pseudo_id: r.pseudo_id, age_band: r.age_band, baseline_severity: r.baseline_severity })));
}

export async function trialPrescreen(ctx: Ctx, pseudo_id: string) {
  const g = await guard(ctx, "research.trial", { type: "trial" });
  if (!g.ok) return g;
  const { records } = await consentedRecords(ctx, "trial_prescreen");
  const rec = records.find((r) => r.pseudo_id === pseudo_id);
  if (!rec) return fail(404, "record not available (not found or research consent not granted)");
  const snap = TrialSnapshotSchema.parse(trialSnapshot);
  const results = runTrialPrescreen(snap, rec.condition_code, rec.features);
  await audit(ctx, { action: "trial.prescreen", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "research_record", details: { snapshot_date: snap.snapshot_date, trials: results.map((r) => ({ id: r.trial_id, overall: r.overall })) } });
  return ok({ snapshot_date: snap.snapshot_date, source: snap.source, features: rec.features, results });
}

export async function researchOverview(ctx: Ctx) {
  const g = await guard(ctx, "research.query", { type: "overview" });
  if (!g.ok) return g;
  const modules = (await listModuleVersions(ctx.db)).filter((m) => m.status === "active");
  return ok(modules.map((m) => ({ condition_code: m.manifest.condition_code, display_name: m.manifest.display_name, module_id: m.module_id, outcomes: m.manifest.outcome_definitions, treatment_classes: m.manifest.treatment_option_cards.filter((c) => c.option_type === "drug_class").map((c) => ({ id: c.id, label: c.label })) })));
}

export { getActiveManifest };
