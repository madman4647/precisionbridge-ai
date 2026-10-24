import * as t from "../schema";
import type { DB } from "../client";
import { truncateAll, bumpModuleCache } from "../client";
import { auditRow, insertChunks } from "../repo";
import { loadBundled } from "@/core/modules/registry";
import { processCheckIn } from "@/core/orchestrator/patientWing";
import { ANCHOR, generatePatients, type ExpectedLabels } from "./generator";
import type { AuditEventInput } from "@/core/audit/types";
import type { AlertRecord, CarePlanRecord, ConsentRecord, DecisionRecord, ModuleVersionRecord, PatientRecord } from "@/lib/models";

const DAY = 86400000;

/** Deterministic seed: 300 synthetic patients (100 per module), 4–8 check-ins each, plan snapshots, consents and audit trail. */
export async function seedAll(db: DB): Promise<{ labels: ExpectedLabels; patients: number; checkins: number }> {
  const manifests = loadBundled();
  const byId = new Map(manifests.map((m) => [m.module_id, m]));
  const { patients, labels } = generatePatients(manifests);

  const moduleRows: ModuleVersionRecord[] = manifests.map((m) => ({ id: `mv_${m.module_id}_${m.module_version}`, module_id: m.module_id, version: m.module_version, status: "active", created_at: new Date(ANCHOR.getTime() - 90 * DAY).toISOString(), manifest: m, warnings: [] }));
  await insertChunks(db, t.moduleVersions, moduleRows.map((m) => ({ id: m.id, module_id: m.module_id, version: m.version, status: m.status, created_at: m.created_at, data: m })));

  const rows = { patients: [] as any[], consents: [] as any[], research: [] as any[], checkins: [] as any[], evals: [] as any[], alerts: [] as any[], audit: [] as any[], plans: [] as any[], decisions: [] as any[] };
  let seq = 0;
  const audit = (e: AuditEventInput & { ts: string }) => rows.audit.push(auditRow({ ...e, id: `ae_seed_${String(++seq).padStart(6, "0")}` }));

  for (const p of patients) {
    const manifest = byId.get(p.module_id)!;
    const rec: PatientRecord = { id: p.id, display_name: p.display_name, module_id: p.module_id, condition_code: p.condition_code, clinician_id: p.clinician_id, age_band: p.age_band, sex_at_birth: p.sex_at_birth, profile: p.profile, scenarios: p.scenarios };
    rows.patients.push({ id: p.id, module_id: p.module_id, condition_code: p.condition_code, clinician_id: p.clinician_id, data: rec });

    const at = new Date(ANCHOR.getTime() - 120 * DAY).toISOString();
    for (const [kind, granted] of [["clinical", p.consent_clinical], ["research", p.consent_research]] as const) {
      const c: ConsentRecord = { id: `consent-${p.id}-${kind}`, patient_id: p.id, kind, granted, at, changed_by: p.id, note: "Seeded demo consent (synthetic)" };
      rows.consents.push({ id: c.id, patient_id: p.id, kind, granted, at, data: c });
      audit({ action: "consent.changed", outcome: "success", actor_id: p.id, actor_role: "patient", resource_type: "consent", resource_id: c.id, details: { kind, granted, patient_ref: p.id }, ts: at });
    }
    rows.research.push({ id: `rr-${p.id}`, patient_id: p.id, condition_code: p.condition_code, data: p.research });

    for (const ci of p.checkins) {
      rows.checkins.push({ id: ci.id, patient_id: p.id, created_at: ci.created_at, data: ci });
      const out = await processCheckIn(manifest, ci, p.id, { now: new Date(ci.created_at) });
      const ev = out.evaluation;
      rows.evals.push({ id: ev.id, checkin_id: ci.id, patient_id: p.id, state: ev.state, evaluated_at: ev.evaluated_at, data: ev });
      for (const a of out.audit) audit({ ...a, ts: ci.created_at });
      if (out.alert) {
        const al: AlertRecord = { id: `al_${ci.id}`, patient_id: p.id, checkin_id: ci.id, evaluation_id: ev.id, state: out.alert.state, status: "open", summary: out.alert.summary, created_at: ci.created_at };
        rows.alerts.push({ id: al.id, patient_id: p.id, checkin_id: ci.id, state: al.state, status: al.status, created_at: al.created_at, data: al });
      }
    }
    for (const sp of p.seeded_plans) {
      const did = `dec_seed_${p.id}_${sp.version}`;
      const dec: DecisionRecord = { id: did, patient_id: p.id, comparison_id: null, action: "approve_plan", rationale: sp.reason, signed_by: "clin-1", signed_by_name: "Dr. Demo Clinician", signed_at: sp.at, selected_option_ids: [], module_id: manifest.module_id, module_version: manifest.module_version, evidence_version: `${manifest.module_id}@${manifest.module_version}`, plan_version: sp.version };
      const plan: CarePlanRecord = { id: `plan_${p.id}_v${sp.version}`, patient_id: p.id, version: sp.version, items: sp.items, decision_id: did, signed_by: "clin-1", signed_at: sp.at, reason: sp.reason, supersedes: sp.version > 1 ? sp.version - 1 : null, module_id: manifest.module_id, module_version: manifest.module_version };
      rows.decisions.push({ id: did, patient_id: p.id, comparison_id: null, action: dec.action, signed_at: sp.at, data: dec });
      rows.plans.push({ id: plan.id, patient_id: p.id, version: plan.version, signed_at: plan.signed_at, data: plan });
      audit({ action: "decision.signed", outcome: "success", actor_id: "clin-1", actor_role: "clinician", resource_type: "decision", resource_id: did, module_id: manifest.module_id, module_version: manifest.module_version, details: { action: dec.action, plan_version: sp.version }, ts: sp.at });
      audit({ action: "plan.version_created", outcome: "success", actor_id: "clin-1", actor_role: "clinician", resource_type: "care_plan", resource_id: plan.id, module_id: manifest.module_id, module_version: manifest.module_version, details: { version: sp.version }, ts: sp.at });
    }
  }

  await insertChunks(db, t.patients, rows.patients, 100);
  await insertChunks(db, t.consents, rows.consents, 300);
  await insertChunks(db, t.researchRecords, rows.research, 200);
  await insertChunks(db, t.checkins, rows.checkins, 300);
  await insertChunks(db, t.riskEvaluations, rows.evals, 150);
  await insertChunks(db, t.alerts, rows.alerts, 300);
  await insertChunks(db, t.decisions, rows.decisions, 200);
  await insertChunks(db, t.carePlans, rows.plans, 200);
  await insertChunks(db, t.auditEvents, rows.audit, 300);
  await insertChunks(db, t.settings, [{ key: "fault_injection", data: { safety_timeout: false } }]);
  bumpModuleCache();
  return { labels, patients: patients.length, checkins: rows.checkins.length };
}

export async function resetAndSeed(db: DB) {
  await truncateAll(db);
  return seedAll(db);
}
