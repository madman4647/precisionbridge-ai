import { z } from "zod";
import { acknowledgeAlert, addDecision, addPlan, getAlert, getComparison, latestPlan, listAlerts, listDecisions, listPlans, markFollowUpsReviewed, setComparisonState, uid, getActiveManifest } from "@/db/repo";
import { audit, fail, guardPatient, ok, type Ctx } from "./context";
import type { CarePlanRecord, DecisionAction, DecisionRecord, PlanItem } from "@/lib/models";

export const Body = z.object({
  action: z.enum(["approve_plan", "request_more_data", "reject_candidate", "record_alternative", "mark_alert_reviewed", "refer_to_human_service", "reorder_options"]),
  rationale: z.string().trim().min(10, "A rationale of at least 10 characters is required").max(2000),
  selected_option_ids: z.array(z.string()).default([]),
  patient_instruction: z.string().trim().max(500).optional(),
  alternative_label: z.string().trim().max(120).optional(),
  option_order: z.array(z.string()).optional(),
  alert_id: z.string().optional(),
  comparison_id: z.string().nullish(),
});

const CREATES_PLAN: DecisionAction[] = ["approve_plan", "request_more_data", "record_alternative", "refer_to_human_service"];

/**
 * Clinician-authenticated sign-off. Signed decisions and plans are immutable: changes create a new version
 * with signer, time and reason. Only this path can create medication items in a care plan.
 */
export async function signDecision(ctx: Ctx, patient_id: string, body: unknown, comparison_id_from_path?: string) {
  const g = await guardPatient(ctx, "decision.sign", patient_id);
  if (!g.ok) return g;
  const { actor, patient } = g.data;
  const parsed = Body.safeParse(body);
  if (!parsed.success) return fail(422, parsed.error.issues.map((i) => i.message).join("; "));
  const b = parsed.data;
  const comparison_id = comparison_id_from_path ?? b.comparison_id ?? null;
  const comparison = comparison_id ? await getComparison(ctx.db, comparison_id) : null;
  if (comparison_id && (!comparison || comparison.patient_id !== patient_id)) return fail(404, "comparison not found");
  const manifest = await getActiveManifest(ctx.db, patient.module_id);
  const module_version = comparison?.result.module_version ?? manifest?.module_version ?? "unknown";
  const evidence_version = comparison?.result.evidence_version ?? `${patient.module_id}@${module_version}`;

  let items: PlanItem[] | null = null;
  const prior = await latestPlan(ctx.db, patient_id);
  const carry = (prior?.items ?? []).filter((i) => i.type === "medication_class" || i.type === "info");

  switch (b.action) {
    case "approve_plan": {
      if (!comparison) return fail(422, "approve_plan requires a comparison");
      if (comparison.result.blocked) return fail(409, "comparison was blocked by the safety gate");
      if (!b.selected_option_ids.length) return fail(422, "select at least one option to approve");
      const cards = new Map(comparison.result.cards.map((c) => [c.option_id, c]));
      for (const id of b.selected_option_ids) {
        const c = cards.get(id);
        if (!c) return fail(422, `option ${id} is not a displayed card (withheld or unknown)`);
        if (c.status === "excluded_by_rule") return fail(422, `option ${c.label} is excluded by rule and cannot be approved`);
      }
      items = [
        ...b.selected_option_ids.map((id): PlanItem => { const c = cards.get(id)!; return c.option_type === "non_drug" ? { type: "referral", text: `${c.label}${b.patient_instruction ? ` — ${b.patient_instruction}` : ""}` } : { type: "medication_class", text: `Your clinician has approved: ${c.label}. Your clinician will explain exactly how to take it.${b.patient_instruction ? ` ${b.patient_instruction}` : ""}` }; }),
        { type: "follow_up_action", text: "Complete a short check-in once a week and tell us about any side effects." },
        ...carry.filter((i) => i.type === "info"),
      ];
      break;
    }
    case "request_more_data":
      if (!b.patient_instruction) return fail(422, "patient_instruction is required (what data should the patient provide?)");
      items = [...carry, { type: "follow_up_action", text: b.patient_instruction }];
      break;
    case "record_alternative":
      if (!b.alternative_label || !b.patient_instruction) return fail(422, "alternative_label and patient_instruction are required");
      items = [{ type: "medication_class", text: `Your clinician has approved: ${b.alternative_label}. ${b.patient_instruction}` }, { type: "follow_up_action", text: "Complete a short check-in once a week." }, ...carry.filter((i) => i.type === "info")];
      break;
    case "refer_to_human_service":
      if (!b.patient_instruction) return fail(422, "patient_instruction is required (which service?)");
      items = [...carry, { type: "referral", text: b.patient_instruction }];
      break;
    case "reorder_options": {
      if (!comparison) return fail(422, "reorder_options requires a comparison");
      const ids = comparison.result.cards.map((c) => c.option_id).sort();
      if (!b.option_order || [...b.option_order].sort().join() !== ids.join()) return fail(422, "option_order must be a permutation of the displayed cards");
      break;
    }
    case "reject_candidate":
      if (!b.selected_option_ids.length) return fail(422, "select the candidate option(s) being rejected");
      break;
    case "mark_alert_reviewed":
      if (!b.alert_id) return fail(422, "alert_id is required");
      break;
  }

  let alert = null;
  if (b.alert_id) {
    alert = await getAlert(ctx.db, b.alert_id);
    if (!alert || alert.patient_id !== patient_id) return fail(404, "alert not found");
  }

  const now = new Date().toISOString();
  const decision: DecisionRecord = {
    id: uid("dec"), patient_id, comparison_id, action: b.action, rationale: b.rationale, signed_by: actor.id, signed_by_name: actor.display_name, signed_at: now,
    selected_option_ids: b.selected_option_ids, patient_instruction: b.patient_instruction, option_order: b.option_order, alert_id: b.alert_id, module_id: patient.module_id, module_version, evidence_version,
  };

  let plan: CarePlanRecord | null = null;
  if (items && CREATES_PLAN.includes(b.action)) {
    plan = { id: uid("plan"), patient_id, version: (prior?.version ?? 0) + 1, items, decision_id: decision.id, signed_by: actor.id, signed_at: now, reason: b.rationale, supersedes: prior?.version ?? null, module_id: patient.module_id, module_version };
    decision.plan_version = plan.version;
  }
  await addDecision(ctx.db, decision);
  if (plan) await addPlan(ctx.db, plan); // (patient_id, version) is unique: concurrent signers cannot overwrite a version
  if (comparison) {
    if (b.action === "approve_plan" || b.action === "record_alternative") await setComparisonState(ctx.db, comparison, "signed");
    else if (b.action === "reject_candidate") await setComparisonState(ctx.db, comparison, "rejected");
  }
  if (alert && alert.status === "open") {
    await acknowledgeAlert(ctx.db, { ...alert, status: "acknowledged", acknowledged_by: actor.id, acknowledged_at: now, disposition: b.action });
    await audit(ctx, { action: "alert.acknowledged", outcome: "success", actor_id: actor.id, actor_role: actor.role, resource_type: "alert", resource_id: alert.id, details: { disposition: b.action } });
  }
  await markFollowUpsReviewed(ctx.db, patient_id);
  await audit(ctx, { action: "decision.signed", outcome: "success", actor_id: actor.id, actor_role: actor.role, resource_type: "decision", resource_id: decision.id, module_id: patient.module_id, module_version, details: { action: b.action, evidence_version, comparison_id, plan_version: plan?.version ?? null, selected: b.selected_option_ids } });
  if (plan) await audit(ctx, { action: "plan.version_created", outcome: "success", actor_id: actor.id, actor_role: actor.role, resource_type: "care_plan", resource_id: plan.id, module_id: patient.module_id, module_version, details: { version: plan.version, supersedes: plan.supersedes } });
  return ok({ decision, plan });
}

export async function acknowledgeAlertOnly(ctx: Ctx, alert_id: string, rationale: string) {
  const alert = ctx.actor?.role === "clinician" ? await getAlert(ctx.db, alert_id) : null;
  const g = await guardPatient(ctx, "alert.acknowledge", alert?.patient_id ?? "__none__");
  if (!g.ok) return g;
  return signDecision(ctx, alert!.patient_id, { action: "mark_alert_reviewed", rationale, alert_id });
}

export async function getPatientHistory(ctx: Ctx, patient_id: string) {
  const g = await guardPatient(ctx, "timeline.read", patient_id);
  if (!g.ok) return g;
  const [decisions, plans, alerts] = await Promise.all([listDecisions(ctx.db, patient_id), listPlans(ctx.db, patient_id), listAlerts(ctx.db, { patient_id })]);
  return ok({ decisions, plans, alerts });
}

export async function signDecisionForComparison(ctx: Ctx, comparison_id: string, body: unknown) {
  const c = ctx.actor?.role === "clinician" ? await getComparison(ctx.db, comparison_id) : null;
  const g = await guardPatient(ctx, "decision.sign", c?.patient_id ?? "__none__");
  if (!g.ok) return g;
  return signDecision(ctx, c!.patient_id, body, comparison_id);
}
