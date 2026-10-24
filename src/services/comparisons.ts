import { addComparison, getActiveManifest, getComparison, listComparisons, listDecisions, listEvaluations, uid, currentConsent, listConsents } from "@/db/repo";
import { audit, fail, guardPatient, ok, type Ctx } from "./context";
import { buildComparison } from "@/core/options/pipeline";
import type { Manifest } from "@/core/modules/schema";
import type { RiskEvaluation } from "@/core/types";
import type { ComparisonRecord, DecisionRecord, PatientRecord } from "@/lib/models";

export async function createComparisonInternal(ctx: Ctx, patient: PatientRecord, manifest: Manifest, ev: RiskEvaluation | null, by: string): Promise<ComparisonRecord | null> {
  const result = buildComparison({ manifest, safety_state: ev?.state ?? null, profile: patient.profile });
  if (result.blocked || !ev) {
    await audit(ctx, { action: "comparison.blocked", outcome: "denied", actor_id: by, actor_role: by === "system" ? "system" : "clinician", resource_type: "patient", resource_id: patient.id, module_id: manifest.module_id, module_version: manifest.module_version, details: { safety_state: ev?.state ?? null } });
    return null;
  }
  const rec: ComparisonRecord = { id: uid("cmp"), patient_id: patient.id, evaluation_id: ev.id, checkin_id: ev.checkin_id, review_state: "draft", result, created_by: by, created_at: result.created_at };
  await addComparison(ctx.db, rec);
  await audit(ctx, { action: "comparison.generated", outcome: "success", actor_id: by, actor_role: by === "system" ? "system" : "clinician", resource_type: "comparison", resource_id: rec.id, module_id: manifest.module_id, module_version: manifest.module_version, details: { evidence_version: result.evidence_version, cards: result.cards.length, withheld: result.withheld.length, safety_state: ev.state } });
  return rec;
}

/** POST /patients/{id}/comparisons — clinician-only; requires a successful safety gate. */
export async function createComparison(ctx: Ctx, patient_id: string) {
  const g = await guardPatient(ctx, "comparison.create", patient_id);
  if (!g.ok) return g;
  const { patient, actor } = g.data;
  const consents = await listConsents(ctx.db, patient_id);
  if (!currentConsent(consents, "clinical")) return fail(403, "Clinical consent not granted for this patient.");
  const manifest = await getActiveManifest(ctx.db, patient.module_id);
  if (!manifest) return fail(409, "No active module for this patient.");
  const evals = await listEvaluations(ctx.db, patient_id);
  const latest = evals[evals.length - 1] ?? null;
  const preview = buildComparison({ manifest, safety_state: latest?.state ?? null, profile: patient.profile });
  if (preview.blocked || !latest) {
    await audit(ctx, { action: "comparison.blocked", outcome: "denied", actor_id: actor.id, actor_role: actor.role, resource_type: "patient", resource_id: patient_id, module_id: manifest.module_id, module_version: manifest.module_version, details: { safety_state: latest?.state ?? null } });
    return fail(409, preview.blocked_reason ?? "Option comparison blocked by safety gate.", { blocked: true, safety_state: latest?.state ?? null });
  }
  const rec = await createComparisonInternal(ctx, patient, manifest, latest, actor.id);
  return ok(rec!);
}

export async function getPatientComparisons(ctx: Ctx, patient_id: string) {
  const g = await guardPatient(ctx, "comparison.read", patient_id);
  if (!g.ok) return g;
  const [comps, decisions, evals] = await Promise.all([listComparisons(ctx.db, patient_id), listDecisions(ctx.db, patient_id), listEvaluations(ctx.db, patient_id)]);
  const latestEval = evals[evals.length - 1] ?? null;
  const manifest = await getActiveManifest(ctx.db, g.data.patient.module_id);
  const gate = buildComparison({ manifest: manifest!, safety_state: latestEval?.state ?? null, profile: g.data.patient.profile });
  const withOrder = comps.map((c) => {
    const reorder = decisions.filter((d) => d.comparison_id === c.id && d.action === "reorder_options").pop();
    return { ...c, clinician_order: reorder?.option_order ?? null, reorder_rationale: reorder?.rationale ?? null };
  });
  return ok({ comparisons: withOrder, gate: { blocked: gate.blocked, reason: gate.blocked_reason ?? null, safety_state: latestEval?.state ?? null } });
}

export async function getComparisonById(ctx: Ctx, id: string) {
  const c = ctx.actor?.role === "clinician" ? await getComparison(ctx.db, id) : null;
  const g = await guardPatient(ctx, "comparison.read", c?.patient_id ?? "__none__");
  if (!g.ok) return g;
  return ok(c!);
}

export type { DecisionRecord };
