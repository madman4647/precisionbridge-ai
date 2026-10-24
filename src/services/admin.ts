import { getActiveManifest, getModuleVersion, getSetting, insertModuleVersion, listAudit, listConsents, listModuleVersions, setModuleStatus, setSetting, uid, auditWrite } from "@/db/repo";
import { audit, fail, guard, ok, type Ctx } from "./context";
import { validateManifest } from "@/core/modules/validator";
import { EMERGENCY_COPY, DEFAULT_PATIENT_MESSAGES } from "@/core/messages";
import { bumpModuleCache } from "@/db/client";
import { resetAndSeed } from "@/db/seed/seed";
import { canonical } from "@/core/research/stats";
import type { ModuleVersionRecord } from "@/lib/models";

export async function listModules(ctx: Ctx) {
  const g = await guard(ctx, "modules.read", { type: "modules" });
  if (!g.ok) return g;
  const mods = await listModuleVersions(ctx.db);
  return ok(mods.map((m) => ({ id: m.id, module_id: m.module_id, version: m.version, status: m.status, display_name: m.manifest.display_name, condition_code: m.manifest.condition_code, last_evidence_review: m.manifest.last_evidence_review, clinical_approver: m.manifest.clinical_approver, rules: m.manifest.red_flag_rules.length, options: m.manifest.treatment_option_cards.length, questions: m.manifest.checkin_question_schema.length, warnings: m.warnings })));
}

/** POST /admin/modules/validate — schema + safety validation, no activation. */
export async function validateModule(ctx: Ctx, json: unknown) {
  const g = await guard(ctx, "modules.manage", { type: "module" });
  if (!g.ok) return g;
  const r = validateManifest(json);
  const mid = (json as any)?.module_id ?? "unknown", mver = (json as any)?.module_version;
  await audit(ctx, { action: r.ok ? "module.validated" : "module.rejected", outcome: r.ok ? "success" : "error", actor_id: g.data.id, actor_role: g.data.role, resource_type: "module", resource_id: String(mid), module_id: String(mid), module_version: mver ? String(mver) : undefined, details: { errors: r.errors.slice(0, 10), warnings: r.warnings.length } });
  return ok({ ok: r.ok, errors: r.errors, warnings: r.warnings, module_id: r.manifest?.module_id ?? null, module_version: r.manifest?.module_version ?? null, summary: r.manifest ? { rules: r.manifest.red_flag_rules.length, options: r.manifest.treatment_option_cards.length, questions: r.manifest.checkin_question_schema.length } : null });
}

/** Register a validated module as a new immutable version and activate it. Rejected modules cannot be activated (T18). */
export async function registerAndActivate(ctx: Ctx, json: unknown) {
  const g = await guard(ctx, "modules.manage", { type: "module" });
  if (!g.ok) return g;
  const r = validateManifest(json);
  if (!r.ok || !r.manifest) {
    await audit(ctx, { action: "module.rejected", outcome: "error", actor_id: g.data.id, actor_role: g.data.role, resource_type: "module", resource_id: String((json as any)?.module_id ?? "unknown"), details: { errors: r.errors.slice(0, 10) } });
    return fail(422, "Module failed validation and cannot be activated.", { errors: r.errors });
  }
  const m = r.manifest;
  const existing = await getModuleVersion(ctx.db, m.module_id, m.module_version);
  if (existing) {
    if (canonical(existing.manifest) !== canonical(m)) return fail(409, "Approved module versions are immutable — publish a new version number.");
  } else {
    await insertModuleVersion(ctx.db, { id: `mv_${m.module_id}_${m.module_version}`, module_id: m.module_id, version: m.module_version, status: "draft", created_at: new Date().toISOString(), manifest: m, warnings: r.warnings });
  }
  return activate(ctx, m.module_id, m.module_version);
}

export async function activate(ctx: Ctx, module_id: string, version: string) {
  const g = await guard(ctx, "modules.manage", { type: "module", id: module_id });
  if (!g.ok) return g;
  const target = await getModuleVersion(ctx.db, module_id, version);
  if (!target) return fail(404, "module version not found");
  const v = validateManifest(target.manifest);
  if (!v.ok) {
    await audit(ctx, { action: "module.rejected", outcome: "error", actor_id: g.data.id, actor_role: g.data.role, resource_type: "module", resource_id: module_id, module_id, module_version: version, details: { errors: v.errors.slice(0, 10) } });
    return fail(422, "Module failed validation and cannot be activated.", { errors: v.errors });
  }
  const all = await listModuleVersions(ctx.db);
  for (const m of all.filter((x) => x.module_id === module_id && x.status === "active" && x.version !== version)) await setModuleStatus(ctx.db, m, "retired");
  await setModuleStatus(ctx.db, target, "active");
  bumpModuleCache();
  await audit(ctx, { action: "module.activated", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "module", resource_id: module_id, module_id, module_version: version });
  return ok({ module_id, version, status: "active" });
}

export async function rollback(ctx: Ctx, module_id: string) {
  const g = await guard(ctx, "modules.manage", { type: "module", id: module_id });
  if (!g.ok) return g;
  const all = (await listModuleVersions(ctx.db)).filter((m) => m.module_id === module_id);
  const active = all.find((m) => m.status === "active");
  const prev = all.filter((m) => m.status === "retired" && (!active || m.version < active.version)).sort((a, b) => b.version.localeCompare(a.version))[0];
  if (!prev) return fail(409, "No earlier version to roll back to.");
  const res = await activate(ctx, module_id, prev.version);
  if (res.ok) await audit(ctx, { action: "module.rolled_back", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "module", resource_id: module_id, module_id, module_version: prev.version, details: { from: active?.version ?? null } });
  return res;
}

export async function viewAudit(ctx: Ctx, f: { action?: string; outcome?: string; actor_id?: string; resource_id?: string; limit?: number }) {
  const g = await guard(ctx, "audit.read", { type: "audit" });
  if (!g.ok) return g;
  return ok(await listAudit(ctx.db, f));
}

export async function consentAudit(ctx: Ctx) {
  const g = await guard(ctx, "audit.read", { type: "consent_audit" });
  if (!g.ok) return g;
  const all = await listConsents(ctx.db);
  const latest = new Map<string, { clinical: boolean; research: boolean }>();
  for (const c of all) { const cur = latest.get(c.patient_id) ?? { clinical: false, research: false }; cur[c.kind] = c.granted; latest.set(c.patient_id, cur); }
  const vals = [...latest.values()];
  const changes = all.filter((c) => !c.note?.startsWith("Seeded")).slice(-100).reverse();
  return ok({ patients: vals.length, clinical_on: vals.filter((v) => v.clinical).length, research_on: vals.filter((v) => v.research).length, research_off: vals.filter((v) => !v.research).length, recent_changes: changes.map((c) => ({ id: c.id, patient_ref: c.patient_id, kind: c.kind, granted: c.granted, at: c.at })) });
}

export async function emergencyCopy(ctx: Ctx) {
  const g = await guard(ctx, "emergency_copy.view", { type: "emergency_copy" });
  if (!g.ok) return g;
  const mods = (await listModuleVersions(ctx.db)).filter((m) => m.status === "active");
  return ok({ emergency: EMERGENCY_COPY, defaults: DEFAULT_PATIENT_MESSAGES, per_module: mods.map((m) => ({ module_id: m.module_id, version: m.version, messages: m.manifest.patient_messages })), editable: false, note: "Copy changes require a new clinically signed module release; there is no live edit in the prototype." });
}

export async function setFaultInjection(ctx: Ctx, safety_timeout: boolean) {
  const g = await guard(ctx, "modules.manage", { type: "fault_injection" });
  if (!g.ok) return g;
  await setSetting(ctx.db, "fault_injection", { safety_timeout });
  await audit(ctx, { action: "fault_injection.changed", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "setting", details: { safety_timeout } });
  return ok({ safety_timeout });
}
export const getFaultInjection = (ctx: Ctx) => getSetting(ctx.db, "fault_injection", { safety_timeout: false });

/** Protected "Reset demo data": truncates and deterministically reseeds. Audited after the reseed so the event survives. */
export async function resetDemo(ctx: Ctx) {
  const g = await guard(ctx, "demo.reset", { type: "demo" });
  if (!g.ok) return g;
  const r = await resetAndSeed(ctx.db);
  await auditWrite(ctx.db, { action: "demo.reset", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "demo", details: { patients: r.patients, checkins: r.checkins }, request_id: ctx.request_id });
  return ok({ patients: r.patients, checkins: r.checkins });
}

export { getActiveManifest, uid };
export type { ModuleVersionRecord };
