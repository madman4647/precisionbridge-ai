import type { Actor } from "@/core/rbac";

export interface DemoUser extends Actor { description: string; clinician_id?: string }

export const DEMO_USERS: DemoUser[] = [
  { id: "u-patient-dm042", role: "patient", display_name: "Patient DM-042 (Type 2 diabetes)", patient_id: "DM-042", description: "Storyboard scenes 1–3" },
  { id: "u-patient-dep017", role: "patient", display_name: "Patient DEP-017 (Depression)", patient_id: "DEP-017", description: "Storyboard scene 4 (self-harm fixture)" },
  { id: "u-patient-htn042", role: "patient", display_name: "Patient HTN-042 (Hypertension)", patient_id: "HTN-042", description: "Hypertension vertical slice" },
  { id: "clin-1", role: "clinician", display_name: "Dr. Demo Clinician", clinician_id: "clin-1", description: "Assigned to most synthetic patients" },
  { id: "clin-2", role: "clinician", display_name: "Dr. Other Clinician", clinician_id: "clin-2", description: "Assigned only to paired access-control cases" },
  { id: "u-researcher", role: "researcher", display_name: "Research Analyst (Demo)", description: "De-identified, consent-gated aggregates only" },
  { id: "u-admin", role: "safety_admin", display_name: "Safety & Admin Reviewer (Demo)", description: "Modules, audit log, metrics, demo reset" },
];

export function findDemoUser(id: string): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.id === id);
}
