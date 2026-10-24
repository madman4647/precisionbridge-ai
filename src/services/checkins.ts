import { z } from "zod";
import { addAlert, addCheckIn, addEvaluation, addFollowUp, consentMap, currentConsent, getActiveManifest, getSetting, listConsents, uid } from "@/db/repo";
import { audit, fail, guardPatient, ok, type Ctx } from "./context";
import { coerceAnswers } from "@/core/safety/answers";
import { processCheckIn } from "@/core/orchestrator/patientWing";
import type { CheckInInput } from "@/core/types";
import type { AlertRecord, FollowUpRecord } from "@/lib/models";
import { createComparisonInternal } from "./comparisons";

const Body = z.object({
  answers: z.record(z.string(), z.unknown()),
  units: z.record(z.string(), z.unknown()).optional(),
  free_text: z.string().max(2000).optional(),
});

/**
 * Safety-first check-in: validate → store → synchronously evaluate with the deterministic engine → alert.
 * The response never contains medication options or rankings.
 */
export async function submitCheckIn(ctx: Ctx, patient_id: string, body: unknown) {
  const g = await guardPatient(ctx, "checkin.create", patient_id);
  if (!g.ok) return g;
  const { patient, actor } = g.data;
  const consents = await listConsents(ctx.db, patient_id);
  if (!currentConsent(consents, "clinical")) {
    await audit(ctx, { action: "access.denied", outcome: "denied", actor_id: actor.id, actor_role: actor.role, resource_type: "checkin", resource_id: patient_id, details: { reason: "clinical consent not granted" } });
    return fail(403, "Clinical consent is required before submitting a check-in.");
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return fail(422, "invalid body");
  const manifest = await getActiveManifest(ctx.db, patient.module_id);
  const coerced = manifest ? coerceAnswers(manifest, parsed.data.answers, parsed.data.units ?? {}) : { answers: {}, units: {}, errors: [] as string[] };
  if (coerced.errors.length) return fail(422, coerced.errors.join("; "));

  const now = new Date();
  const checkin: CheckInInput = { id: uid("ci"), patient_id, module_id: patient.module_id, created_at: now.toISOString(), source: "patient", answers: coerced.answers, units: coerced.units, free_text: parsed.data.free_text ?? "", observed_at: now.toISOString() };

  const fault = await getSetting(ctx.db, "fault_injection", { safety_timeout: false });
  const out = await processCheckIn(manifest, checkin, actor.id, fault.safety_timeout ? { evaluator: () => new Promise<never>(() => {}), timeoutMs: 400, now } : { now });

  await addCheckIn(ctx.db, checkin);
  await addEvaluation(ctx.db, out.evaluation, patient_id);
  let alert: AlertRecord | null = null;
  if (out.alert) {
    alert = { id: uid("al"), patient_id, checkin_id: checkin.id, evaluation_id: out.evaluation.id, state: out.alert.state, status: "open", summary: out.alert.summary, created_at: now.toISOString() };
    await addAlert(ctx.db, alert);
  }
  for (const e of out.audit) await audit(ctx, { ...e, actor_id: e.actor_role === "patient" ? actor.id : e.actor_id, resource_id: e.action === "alert.created" ? alert?.id : e.resource_id });

  let draft_comparison_id: string | null = null;
  if (out.comparison_allowed && manifest) {
    const c = await createComparisonInternal(ctx, patient, manifest, out.evaluation, "system");
    draft_comparison_id = c?.id ?? null; // clinician-facing only; not exposed to the patient response
  }
  void draft_comparison_id;
  return ok({ checkin_id: checkin.id, ...out.patient_view, evaluation: { id: out.evaluation.id, state: out.evaluation.state, triggered_rule_ids: out.evaluation.triggered_rule_ids, missing_fields: out.evaluation.missing_fields, module_version: out.evaluation.module_version } });
}

const FollowUpBody = z.object({
  plan_version: z.number().int().min(1),
  response: z.enum(["better", "same", "worse", "not_started"]),
  side_effects: z.array(z.string().max(60)).max(10).default([]),
  severity: z.enum(["none", "mild", "moderate", "severe"]).default("none"),
  note: z.string().max(1000).default(""),
});

export async function submitFollowUp(ctx: Ctx, patient_id: string, body: unknown) {
  const g = await guardPatient(ctx, "followup.create", patient_id);
  if (!g.ok) return g;
  const parsed = FollowUpBody.safeParse(body);
  if (!parsed.success) return fail(422, "invalid body");
  const f: FollowUpRecord = { id: uid("fu"), patient_id, created_at: new Date().toISOString(), reviewed: false, ...parsed.data };
  await addFollowUp(ctx.db, f);
  await audit(ctx, { action: "followup.submitted", outcome: "success", actor_id: g.data.actor.id, actor_role: "patient", resource_type: "followup", resource_id: f.id, details: { plan_version: f.plan_version, severity: f.severity } });
  return ok({ id: f.id, note: "Recorded and linked to your plan version. This is not monitored 24/7 — if you feel unwell, contact your care team or local emergency services." });
}

export { consentMap };
