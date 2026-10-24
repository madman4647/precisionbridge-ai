import type { Role } from "./types";

export type Permission =
  | "patient.read" | "patient.list" | "checkin.create" | "consent.manage" | "profile.edit" | "plan.read" | "followup.create"
  | "timeline.read" | "comparison.create" | "comparison.read" | "decision.sign" | "alert.acknowledge"
  | "research.query" | "research.hypothesis" | "research.trial" | "research.export"
  | "modules.read" | "modules.manage" | "audit.read" | "metrics.read" | "demo.reset" | "emergency_copy.view" | "export.clinician_summary";

const MATRIX: Record<Role, Permission[]> = {
  patient: ["patient.read", "checkin.create", "consent.manage", "profile.edit", "plan.read", "followup.create", "modules.read"],
  clinician: ["patient.read", "patient.list", "timeline.read", "comparison.create", "comparison.read", "decision.sign", "alert.acknowledge", "modules.read", "audit.read", "export.clinician_summary", "plan.read"],
  researcher: ["research.query", "research.hypothesis", "research.trial", "research.export", "modules.read"],
  safety_admin: ["modules.read", "modules.manage", "audit.read", "metrics.read", "demo.reset", "emergency_copy.view"],
};

export interface Actor {
  id: string;
  role: Role;
  display_name: string;
  patient_id?: string; // patients: own record only
  assigned_patient_ids?: string[] | "all-assigned"; // resolved by repo for clinicians
}

export function can(role: Role, p: Permission): boolean {
  return MATRIX[role].includes(p);
}

export interface AuthzResult { ok: boolean; reason?: string }

/** Role + resource-scope check. Clinician assignment is resolved by the caller (`assigned`). */
export function authorize(actor: Actor | null, p: Permission, scope: { patient_id?: string; assigned?: boolean } = {}): AuthzResult {
  if (!actor) return { ok: false, reason: "unauthenticated" };
  if (!can(actor.role, p)) return { ok: false, reason: `role ${actor.role} lacks ${p}` };
  if (scope.patient_id) {
    if (actor.role === "patient" && actor.patient_id !== scope.patient_id) return { ok: false, reason: "patients may access only their own record" };
    if (actor.role === "clinician" && !scope.assigned) return { ok: false, reason: "patient not assigned to this clinician" };
    if (actor.role === "researcher" || actor.role === "safety_admin") return { ok: false, reason: `${actor.role} has no access to patient records` };
  }
  return { ok: true };
}
