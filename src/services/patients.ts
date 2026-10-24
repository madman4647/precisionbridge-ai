import { z } from "zod";
import { addConsent, consentMap, currentConsent, getActiveManifest, latestEvaluations, listAlerts, listCheckIns, listConsents, listDecisions, listEvaluations, listFollowUps, listPatients, listPlans, updatePatientProfile, uid, getPatient, listComparisons, latestPlan, listModuleVersions } from "@/db/repo";
import { audit, fail, guard, guardPatient, ok, type Ctx } from "./context";
import { detectSeriesConflicts, usableObservations, type SeriesPoint } from "@/core/safety/quality";
import type { PatientRecord, ConsentRecord, AlertRecord } from "@/lib/models";
import type { Datum, Profile } from "@/core/types";
import { ManifestSchema } from "@/core/modules/schema";
import { buildWhatChanged } from "@/core/timeline";

export async function getPatientDetail(ctx: Ctx, id: string) {
  const g = await guardPatient(ctx, "patient.read", id);
  if (!g.ok) return g;
  const { patient, actor } = g.data;
  const consents = await listConsents(ctx.db, id);
  const base = { id: patient.id, display_name: patient.display_name, module_id: patient.module_id, condition_code: patient.condition_code, age_band: patient.age_band, profile: patient.profile, consent: { clinical: currentConsent(consents, "clinical"), research: currentConsent(consents, "research") } };
  if (actor.role === "patient") return ok({ ...base, completeness: profileCompleteness(patient, await getActiveManifest(ctx.db, patient.module_id)) });
  return ok({ ...base, clinician_id: patient.clinician_id, scenarios: patient.scenarios, sex_at_birth: patient.sex_at_birth, completeness: profileCompleteness(patient, await getActiveManifest(ctx.db, patient.module_id)) });
}

export function profileCompleteness(p: PatientRecord, m: { required_profile_fields: { key: string; label: string; critical: boolean; requires_verification: boolean }[] } | null) {
  const items = (m?.required_profile_fields ?? []).map((f) => {
    const dt = p.profile.fields[f.key] as Datum | undefined;
    const unknownAllergy = f.key === "allergy_status" && p.profile.allergy_status === "unknown";
    const missing = !dt || unknownAllergy || (dt.value === null && dt.null_reason !== "not_applicable");
    const unverified = !missing && f.requires_verification && dt!.verification_status !== "verified";
    return { key: f.key, label: f.label, critical: f.critical, status: missing ? "missing" : unverified ? "unverified" : "complete" } as const;
  });
  const done = items.filter((i) => i.status === "complete").length;
  return { items, percent: items.length ? Math.round((done / items.length) * 100) : 100 };
}

const ProfilePatch = z.object({
  allergy_status: z.enum(["none_known", "listed", "unknown"]).optional(),
  allergies: z.array(z.object({ substance: z.string().min(1).max(80), class_tag: z.string().min(1).max(40), reaction: z.string().max(80) })).max(10).optional(),
  preferences: z.array(z.string().max(40)).max(10).optional(),
  medications: z.array(z.object({ name: z.string().min(1).max(80), class_tag: z.string().min(1).max(40), start_date: z.string().max(10) })).max(10).optional(),
});

export async function updateProfile(ctx: Ctx, id: string, body: unknown) {
  const g = await guardPatient(ctx, "profile.edit", id);
  if (!g.ok) return g;
  const parsed = ProfilePatch.safeParse(body);
  if (!parsed.success) return fail(422, parsed.error.issues.map((i) => i.message).join("; "));
  const p = g.data.patient;
  const prof: Profile = JSON.parse(JSON.stringify(p.profile));
  const now = new Date().toISOString();
  const x = parsed.data;
  if (x.allergy_status) {
    prof.allergy_status = x.allergy_status;
    // Patient-entered data is never silently treated as clinician-verified.
    prof.fields.allergy_status = { value: x.allergy_status, observed_at: now, source: "patient", verification_status: "unverified", ...(x.allergy_status === "unknown" ? { null_reason: "unknown" as const } : {}) };
  }
  if (x.allergies) prof.allergies = x.allergies.map((a) => ({ ...a, verification_status: "unverified" as const }));
  if (x.preferences) prof.preferences = x.preferences;
  if (x.medications) {
    const existing = prof.medications.filter((m) => m.status === "stopped");
    prof.medications = [...x.medications.map((m) => ({ ...m, status: "active" as const })), ...existing];
  }
  await updatePatientProfile(ctx.db, id, { profile: prof });
  await audit(ctx, { action: "profile.updated", outcome: "success", actor_id: g.data.actor.id, actor_role: "patient", resource_type: "patient", resource_id: id, details: { fields: Object.keys(x) } });
  return ok({ updated: Object.keys(x) });
}

export async function setConsent(ctx: Ctx, id: string, kind: "clinical" | "research", granted: boolean) {
  const g = await guardPatient(ctx, "consent.manage", id);
  if (!g.ok) return g;
  const c: ConsentRecord = { id: uid("consent"), patient_id: id, kind, granted, at: new Date().toISOString(), changed_by: g.data.actor.id };
  await addConsent(ctx.db, c);
  await audit(ctx, { action: "consent.changed", outcome: "success", actor_id: g.data.actor.id, actor_role: "patient", resource_type: "consent", resource_id: c.id, details: { kind, granted, patient_ref: id } });
  const consents = await listConsents(ctx.db, id);
  return ok({ clinical: currentConsent(consents, "clinical"), research: currentConsent(consents, "research") });
}

export interface CaseloadRow {
  patient_id: string; display_name: string; module_id: string; condition_code: string; category: "urgent" | "prompt_review" | "pending" | "stable";
  latest_state: string | null; open_alert_id: string | null; open_alert_state: string | null; last_checkin_at: string | null; reasons: string[];
}

export async function getCaseload(ctx: Ctx) {
  const g = await guard(ctx, "patient.list", { type: "caseload" });
  if (!g.ok) return g;
  const patients = await listPatients(ctx.db, g.data.id);
  const evals = await latestEvaluations(ctx.db);
  const alerts = await listAlerts(ctx.db, { status: "open" });
  const openByPatient = new Map<string, AlertRecord[]>();
  for (const a of alerts) { const l = openByPatient.get(a.patient_id) ?? []; l.push(a); openByPatient.set(a.patient_id, l); }
  const followups = (await listFollowUps(ctx.db)).filter((f) => !f.reviewed);
  const fuBy = new Set(followups.map((f) => f.patient_id));
  const consents = await consentMap(ctx.db);
  const rows: CaseloadRow[] = [];
  for (const p of patients) {
    if (consents.get(p.id)?.clinical === false) continue;
    const ev = evals.get(p.id) ?? null;
    const open = openByPatient.get(p.id) ?? [];
    const urgent = open.find((a) => a.state === "URGENT");
    const prompt = open.find((a) => a.state !== "URGENT");
    const reasons: string[] = [];
    let category: CaseloadRow["category"] = "stable";
    if (urgent) { category = "urgent"; reasons.push("Open URGENT alert — not yet acknowledged"); }
    else if (prompt) { category = "prompt_review"; reasons.push(`Open ${prompt.state.replace(/_/g, " ").toLowerCase()} alert`); }
    else if (fuBy.has(p.id)) { category = "pending"; reasons.push("Unreviewed patient follow-up report"); }
    if (category !== "stable" || p.scenarios.includes("fixture")) rows.push({ patient_id: p.id, display_name: p.display_name, module_id: p.module_id, condition_code: p.condition_code, category, latest_state: ev?.state ?? null, open_alert_id: (urgent ?? prompt)?.id ?? null, open_alert_state: (urgent ?? prompt)?.state ?? null, last_checkin_at: ev?.evaluated_at ?? null, reasons });
  }
  const order = { urgent: 0, prompt_review: 1, pending: 2, stable: 3 };
  rows.sort((a, b) => order[a.category] - order[b.category] || (b.last_checkin_at ?? "").localeCompare(a.last_checkin_at ?? "") || a.patient_id.localeCompare(b.patient_id));
  return ok(rows);
}

export async function getTimeline(ctx: Ctx, id: string) {
  const g = await guardPatient(ctx, "timeline.read", id);
  if (!g.ok) return g;
  const { patient } = g.data;
  const manifest = await getActiveManifest(ctx.db, patient.module_id);
  const [checkins, evals, decisions, plans, alerts, followups] = await Promise.all([listCheckIns(ctx.db, id), listEvaluations(ctx.db, id), listDecisions(ctx.db, id), listPlans(ctx.db, id), listAlerts(ctx.db, { patient_id: id }), listFollowUps(ctx.db, id)]);
  const evByCheckin = new Map(evals.map((e) => [e.checkin_id, e]));
  const points: SeriesPoint[] = evals.flatMap((e) => e.observations.map((o) => ({ ...o, checkin_id: e.checkin_id })));
  const conflicts = manifest ? detectSeriesConflicts(manifest, points) : [];
  const usable = usableObservations(points, conflicts);
  const concepts = [...new Set(points.map((p) => p.concept))];
  const series = concepts.map((concept) => {
    const def = manifest?.measure_definitions.find((m) => m.concept === concept);
    return {
      concept, label: def?.label ?? concept, unit: def?.canonical_unit ?? "",
      points: checkins.map((c) => {
        const p = usable.find((u) => u.checkin_id === c.id && u.concept === concept);
        const raw = points.find((u) => u.checkin_id === c.id && u.concept === concept);
        return { at: c.created_at, checkin_id: c.id, value: p && def ? Math.round(p.value * (def.units[p.unit] ?? 1) * 10) / 10 : null, missing: !raw, suspect: !!raw && !p };
      }),
    };
  });
  const derivedSeries = [] as { concept: string; label: string; unit: string; points: { at: string; checkin_id: string; value: number | null; missing: boolean; suspect: boolean }[] }[];
  if (manifest) {
    const phq = manifest.derived_measures.find((d) => d.of.every((f) => f.startsWith("answers.")));
    if (phq) derivedSeries.push({ concept: phq.id, label: phq.label, unit: "", points: checkins.map((c) => { const vals = phq.of.map((f) => c.answers[f.split(".")[1]]); const complete = vals.every((v) => typeof v === "number"); return { at: c.created_at, checkin_id: c.id, value: complete ? (vals as number[]).reduce((a, b) => a + b, 0) : null, missing: !complete, suspect: false }; }) });
  }
  const medEvents = patient.profile.medications.flatMap((m) => [{ at: m.start_date, label: `Started ${m.name} (${m.class_tag})`, kind: "start" as const }, ...(m.stop_date ? [{ at: m.stop_date, label: `Stopped ${m.name}${m.intolerance ? ` — ${m.intolerance}` : ""}`, kind: "stop" as const }] : [])]);
  const planEvents = plans.map((p) => ({ at: p.signed_at, label: `Plan v${p.version} signed`, kind: "plan" as const }));
  const rows = checkins.map((c) => ({ checkin_id: c.id, at: c.created_at, state: evByCheckin.get(c.id)?.state ?? null, triggered: evByCheckin.get(c.id)?.triggered_rule_ids ?? [], missing: evByCheckin.get(c.id)?.missing_fields ?? [] }));
  const whatChanged = buildWhatChanged(checkins, evals, patient.profile.medications, plans);
  return ok({ series: [...series, ...derivedSeries], rows, conflicts, medication_events: [...medEvents, ...planEvents].sort((a, b) => a.at.localeCompare(b.at)), what_changed: whatChanged, alerts, decisions, plans, followups, watermark: true });
}

export async function getPatientPlan(ctx: Ctx, id: string) {
  const g = await guardPatient(ctx, "plan.read", id);
  if (!g.ok) return g;
  const plan = await latestPlan(ctx.db, id);
  const followups = await listFollowUps(ctx.db, id);
  // Patients receive ONLY the signed plan items — never drafts, options or rankings.
  return ok({ plan: plan ? { version: plan.version, items: plan.items, signed_at: plan.signed_at, signed_by: plan.signed_by === "clin-1" ? "Dr. Demo Clinician" : plan.signed_by, reason: plan.reason } : null, followups: followups.map((f) => ({ id: f.id, plan_version: f.plan_version, created_at: f.created_at, response: f.response, severity: f.severity, side_effects: f.side_effects })) });
}

export async function listDemoPatients(ctx: Ctx) {
  const g = await guard(ctx, "patient.list", { type: "patients" });
  if (!g.ok) return g;
  const ps = await listPatients(ctx.db, g.data.id);
  return ok(ps.map((p) => ({ id: p.id, display_name: p.display_name, module_id: p.module_id, scenarios: p.scenarios })));
}

export async function createDemoPatient(ctx: Ctx, body: unknown) {
  const g = await guard(ctx, "demo.reset", { type: "demo_patient" });
  if (!g.ok) return g;
  const parsed = z.object({ module_id: z.string() }).safeParse(body);
  if (!parsed.success) return fail(422, "module_id required");
  const m = await getActiveManifest(ctx.db, parsed.data.module_id);
  if (!m) return fail(404, "module not active");
  const id = `SYN-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const now = new Date().toISOString();
  const profile: Profile = { fields: { allergy_status: { value: "unknown", observed_at: now, source: "synthetic", verification_status: "unverified", null_reason: "not_asked" } }, allergy_status: "unknown", allergies: [], medications: [], conditions: [{ code: m.condition_code, label: m.display_name, tag: m.module_id, verification_status: "unverified" }], preferences: [], genotype_reports: [] };
  const rec: PatientRecord = { id, display_name: `Fakename Testperson (${id})`, module_id: m.module_id, condition_code: m.condition_code, clinician_id: "clin-1", age_band: "35-54", sex_at_birth: "F", profile, scenarios: ["created_via_api"] };
  const { patients } = await import("@/db/schema");
  await ctx.db.insert(patients).values({ id, module_id: m.module_id, condition_code: m.condition_code, clinician_id: "clin-1", data: rec });
  await audit(ctx, { action: "profile.updated", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "patient", resource_id: id, details: { created: true } });
  return ok({ id });
}

export { getPatient, listComparisons, listModuleVersions, ManifestSchema };
