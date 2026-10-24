import type { DB } from "@/db/client";
import { auditWrite, getPatient, uid } from "@/db/repo";
import { authorize, type Actor, type Permission } from "@/core/rbac";
import type { PatientRecord } from "@/lib/models";

export interface Ctx { db: DB; actor: Actor | null; request_id: string }
export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string; payload?: unknown };

export const ok = <T,>(data: T): Result<T> => ({ ok: true, data });
export const fail = (status: number, error: string, payload?: unknown): Result<never> => ({ ok: false, status, error, payload });

export function makeCtx(db: DB, actor: Actor | null): Ctx {
  return { db, actor, request_id: uid("rq") };
}

export async function audit(ctx: Ctx, e: Parameters<typeof auditWrite>[1]) {
  await auditWrite(ctx.db, { request_id: ctx.request_id, ...e });
}

/** Server-side RBAC. Every denial is audited and returns no sensitive payload. */
export async function guard(ctx: Ctx, perm: Permission, resource?: { type: string; id?: string }): Promise<Result<Actor>> {
  const r = authorize(ctx.actor, perm);
  if (!r.ok) {
    await audit(ctx, { action: "access.denied", outcome: "denied", actor_id: ctx.actor?.id ?? "anonymous", actor_role: ctx.actor?.role ?? "system", resource_type: resource?.type, resource_id: resource?.id, details: { permission: perm, reason: r.reason } });
    return fail(ctx.actor ? 403 : 401, "forbidden");
  }
  return ok(ctx.actor!);
}

/** Authorise access to one patient's record (self / assigned clinician only) and return it. */
export async function guardPatient(ctx: Ctx, perm: Permission, patient_id: string): Promise<Result<{ actor: Actor; patient: PatientRecord }>> {
  const patient = ctx.actor && (ctx.actor.role === "clinician" || ctx.actor.role === "patient") ? await getPatient(ctx.db, patient_id) : null;
  const assigned = !!patient && ctx.actor?.role === "clinician" && patient.clinician_id === ctx.actor.id;
  const r = authorize(ctx.actor, perm, { patient_id, assigned });
  if (!r.ok || !ctx.actor) {
    await audit(ctx, { action: "access.denied", outcome: "denied", actor_id: ctx.actor?.id ?? "anonymous", actor_role: ctx.actor?.role ?? "system", resource_type: "patient", resource_id: patient_id, details: { permission: perm, reason: r.reason } });
    return fail(ctx.actor ? 403 : 401, "forbidden");
  }
  if (!patient) return fail(404, "not found");
  return ok({ actor: ctx.actor, patient });
}
