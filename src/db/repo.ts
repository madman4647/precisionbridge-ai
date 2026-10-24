import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import * as t from "./schema";
import type { DB } from "./client";
import { moduleCacheVersion } from "./client";
import type { AuditEvent, AuditEventInput } from "@/core/audit/types";
import { ManifestSchema, type Manifest } from "@/core/modules/schema";
import type { CheckInInput, RiskEvaluation } from "@/core/types";
import type { ResearchRecord } from "@/core/research/cohort";
import type { AlertRecord, CarePlanRecord, CohortRecord, ComparisonRecord, ConsentRecord, DecisionRecord, FollowUpRecord, HypothesisRecord, ModuleVersionRecord, PatientRecord } from "@/lib/models";

const d = <T,>(rows: { data: unknown }[]) => rows.map((r) => r.data as T);
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
export { uid };

async function insertChunks(db: DB, table: any, rows: any[], size = 300) {
  for (let i = 0; i < rows.length; i += size) await db.insert(table).values(rows.slice(i, i + size)).onConflictDoNothing();
}
export { insertChunks };

// ---------------- audit ----------------
export async function auditWrite(db: DB, e: AuditEventInput & { ts?: string; id?: string; request_id?: string }) {
  const ts = e.ts ?? new Date().toISOString();
  const ev: AuditEvent = { ...e, id: e.id ?? uid("ae"), ts, request_id: e.request_id ?? uid("rq") };
  await db.insert(t.auditEvents).values({ id: ev.id, ts, actor_id: ev.actor_id, actor_role: ev.actor_role, action: ev.action, outcome: ev.outcome, resource_id: ev.resource_id ?? null, data: ev }).onConflictDoNothing();
}
export function auditRow(e: AuditEventInput & { ts: string; id: string }) {
  const ev: AuditEvent = { ...e, request_id: e.id.replace("ae", "rq") };
  return { id: ev.id, ts: ev.ts, actor_id: ev.actor_id, actor_role: ev.actor_role, action: ev.action, outcome: ev.outcome, resource_id: ev.resource_id ?? null, data: ev };
}
export async function listAudit(db: DB, f: { action?: string; outcome?: string; actor_id?: string; resource_id?: string; limit?: number } = {}): Promise<AuditEvent[]> {
  const conds = [f.action && eq(t.auditEvents.action, f.action), f.outcome && eq(t.auditEvents.outcome, f.outcome), f.actor_id && eq(t.auditEvents.actor_id, f.actor_id), f.resource_id && eq(t.auditEvents.resource_id, f.resource_id)].filter(Boolean) as any[];
  const q = db.select().from(t.auditEvents).where(conds.length ? and(...conds) : undefined).orderBy(desc(t.auditEvents.ts), desc(t.auditEvents.id)).limit(f.limit ?? 200);
  return d<AuditEvent>(await q);
}
export async function listAuditByResources(db: DB, ids: string[], limit = 60): Promise<AuditEvent[]> {
  if (!ids.length) return [];
  return d<AuditEvent>(await db.select().from(t.auditEvents).where(inArray(t.auditEvents.resource_id, ids)).orderBy(desc(t.auditEvents.ts), desc(t.auditEvents.id)).limit(limit));
}
export async function countAudit(db: DB, action: string, outcome?: string): Promise<number> {
  const r = await db.select({ n: sql<number>`count(*)::int` }).from(t.auditEvents).where(and(eq(t.auditEvents.action, action), outcome ? eq(t.auditEvents.outcome, outcome) : undefined));
  return Number(r[0]?.n ?? 0);
}

// ---------------- patients & consents ----------------
export async function getPatient(db: DB, id: string): Promise<PatientRecord | null> {
  const r = await db.select().from(t.patients).where(eq(t.patients.id, id)).limit(1);
  return r[0] ? (r[0].data as PatientRecord) : null;
}
export async function listPatients(db: DB, clinician_id?: string): Promise<PatientRecord[]> {
  const r = await db.select().from(t.patients).where(clinician_id ? eq(t.patients.clinician_id, clinician_id) : undefined).orderBy(asc(t.patients.id));
  return d<PatientRecord>(r);
}
export async function updatePatientProfile(db: DB, id: string, patch: Partial<PatientRecord>) {
  const p = await getPatient(db, id);
  if (!p) return;
  const next = { ...p, ...patch };
  await db.update(t.patients).set({ data: next }).where(eq(t.patients.id, id));
}
export async function addConsent(db: DB, c: ConsentRecord) {
  await db.insert(t.consents).values({ id: c.id, patient_id: c.patient_id, kind: c.kind, granted: c.granted, at: c.at, data: c });
}
export async function listConsents(db: DB, patient_id?: string): Promise<ConsentRecord[]> {
  const r = await db.select().from(t.consents).where(patient_id ? eq(t.consents.patient_id, patient_id) : undefined).orderBy(asc(t.consents.at), asc(t.consents.id));
  return d<ConsentRecord>(r);
}
export function currentConsent(list: ConsentRecord[], kind: "clinical" | "research"): boolean {
  const mine = list.filter((c) => c.kind === kind);
  return mine.length ? mine[mine.length - 1].granted : false;
}
export async function consentMap(db: DB): Promise<Map<string, { clinical: boolean; research: boolean }>> {
  const all = await listConsents(db);
  const m = new Map<string, { clinical: boolean; research: boolean }>();
  for (const c of all) { const cur = m.get(c.patient_id) ?? { clinical: false, research: false }; cur[c.kind] = c.granted; m.set(c.patient_id, cur); }
  return m;
}

// ---------------- check-ins & evaluations ----------------
export async function addCheckIn(db: DB, c: CheckInInput) {
  await db.insert(t.checkins).values({ id: c.id, patient_id: c.patient_id, created_at: c.created_at, data: c });
}
export async function listCheckIns(db: DB, patient_id: string): Promise<CheckInInput[]> {
  return d<CheckInInput>(await db.select().from(t.checkins).where(eq(t.checkins.patient_id, patient_id)).orderBy(asc(t.checkins.created_at), asc(t.checkins.id)));
}
export async function getCheckIn(db: DB, id: string): Promise<CheckInInput | null> {
  const r = await db.select().from(t.checkins).where(eq(t.checkins.id, id)).limit(1);
  return r[0] ? (r[0].data as CheckInInput) : null;
}
export async function addEvaluation(db: DB, e: RiskEvaluation, patient_id: string) {
  await db.insert(t.riskEvaluations).values({ id: e.id, checkin_id: e.checkin_id, patient_id, state: e.state, evaluated_at: e.evaluated_at, data: e });
}
export async function listEvaluations(db: DB, patient_id: string): Promise<RiskEvaluation[]> {
  return d<RiskEvaluation>(await db.select().from(t.riskEvaluations).where(eq(t.riskEvaluations.patient_id, patient_id)).orderBy(asc(t.riskEvaluations.evaluated_at), asc(t.riskEvaluations.id)));
}
export async function getEvaluation(db: DB, id: string): Promise<RiskEvaluation | null> {
  const r = await db.select().from(t.riskEvaluations).where(eq(t.riskEvaluations.id, id)).limit(1);
  return r[0] ? (r[0].data as RiskEvaluation) : null;
}
export async function latestEvaluations(db: DB, patient_ids?: string[]): Promise<Map<string, RiskEvaluation>> {
  const rows = await db.select().from(t.riskEvaluations).where(patient_ids ? inArray(t.riskEvaluations.patient_id, patient_ids) : undefined).orderBy(asc(t.riskEvaluations.evaluated_at));
  const m = new Map<string, RiskEvaluation>();
  for (const r of rows) m.set(r.patient_id, r.data as RiskEvaluation);
  return m;
}

// ---------------- alerts ----------------
export async function addAlert(db: DB, a: AlertRecord) {
  await db.insert(t.alerts).values({ id: a.id, patient_id: a.patient_id, checkin_id: a.checkin_id, state: a.state, status: a.status, created_at: a.created_at, data: a });
}
export async function listAlerts(db: DB, f: { patient_id?: string; status?: string } = {}): Promise<AlertRecord[]> {
  const conds = [f.patient_id && eq(t.alerts.patient_id, f.patient_id), f.status && eq(t.alerts.status, f.status)].filter(Boolean) as any[];
  return d<AlertRecord>(await db.select().from(t.alerts).where(conds.length ? and(...conds) : undefined).orderBy(desc(t.alerts.created_at)));
}
export async function getAlert(db: DB, id: string): Promise<AlertRecord | null> {
  const r = await db.select().from(t.alerts).where(eq(t.alerts.id, id)).limit(1);
  return r[0] ? (r[0].data as AlertRecord) : null;
}
export async function acknowledgeAlert(db: DB, a: AlertRecord) {
  await db.update(t.alerts).set({ status: a.status, data: a }).where(eq(t.alerts.id, a.id));
}

// ---------------- comparisons, decisions, plans ----------------
export async function addComparison(db: DB, c: ComparisonRecord) {
  await db.insert(t.comparisons).values({ id: c.id, patient_id: c.patient_id, evaluation_id: c.evaluation_id, review_state: c.review_state, created_at: c.created_at, data: c });
}
export async function getComparison(db: DB, id: string): Promise<ComparisonRecord | null> {
  const r = await db.select().from(t.comparisons).where(eq(t.comparisons.id, id)).limit(1);
  return r[0] ? (r[0].data as ComparisonRecord) : null;
}
export async function listComparisons(db: DB, patient_id: string): Promise<ComparisonRecord[]> {
  return d<ComparisonRecord>(await db.select().from(t.comparisons).where(eq(t.comparisons.patient_id, patient_id)).orderBy(desc(t.comparisons.created_at)));
}
export async function setComparisonState(db: DB, c: ComparisonRecord, state: ComparisonRecord["review_state"]) {
  await db.update(t.comparisons).set({ review_state: state, data: { ...c, review_state: state } }).where(eq(t.comparisons.id, c.id));
}
export async function addDecision(db: DB, x: DecisionRecord) {
  await db.insert(t.decisions).values({ id: x.id, patient_id: x.patient_id, comparison_id: x.comparison_id, action: x.action, signed_at: x.signed_at, data: x });
}
export async function listDecisions(db: DB, patient_id: string): Promise<DecisionRecord[]> {
  return d<DecisionRecord>(await db.select().from(t.decisions).where(eq(t.decisions.patient_id, patient_id)).orderBy(asc(t.decisions.signed_at), asc(t.decisions.id)));
}
export async function addPlan(db: DB, p: CarePlanRecord) {
  await db.insert(t.carePlans).values({ id: p.id, patient_id: p.patient_id, version: p.version, signed_at: p.signed_at, data: p });
}
export async function listPlans(db: DB, patient_id: string): Promise<CarePlanRecord[]> {
  return d<CarePlanRecord>(await db.select().from(t.carePlans).where(eq(t.carePlans.patient_id, patient_id)).orderBy(asc(t.carePlans.version)));
}
export async function latestPlan(db: DB, patient_id: string): Promise<CarePlanRecord | null> {
  const r = await db.select().from(t.carePlans).where(eq(t.carePlans.patient_id, patient_id)).orderBy(desc(t.carePlans.version)).limit(1);
  return r[0] ? (r[0].data as CarePlanRecord) : null;
}
export async function addFollowUp(db: DB, f: FollowUpRecord) {
  await db.insert(t.followups).values({ id: f.id, patient_id: f.patient_id, plan_version: f.plan_version, created_at: f.created_at, reviewed: f.reviewed, data: f });
}
export async function listFollowUps(db: DB, patient_id?: string): Promise<FollowUpRecord[]> {
  return d<FollowUpRecord>(await db.select().from(t.followups).where(patient_id ? eq(t.followups.patient_id, patient_id) : undefined).orderBy(desc(t.followups.created_at)));
}
export async function markFollowUpsReviewed(db: DB, patient_id: string) {
  const all = await listFollowUps(db, patient_id);
  for (const f of all.filter((x) => !x.reviewed)) await db.update(t.followups).set({ reviewed: true, data: { ...f, reviewed: true } }).where(eq(t.followups.id, f.id));
}
export async function countUnsignedMedicationPlans(db: DB): Promise<{ total_med_plan_items: number; unsigned: number }> {
  const plans = d<CarePlanRecord>(await db.select().from(t.carePlans));
  const decisions = new Set((await db.select({ id: t.decisions.id }).from(t.decisions)).map((r) => r.id));
  let total = 0, unsigned = 0;
  for (const p of plans) {
    const meds = p.items.filter((i) => i.type === "medication_class").length;
    if (!meds) continue;
    total += meds;
    const seeded = p.reason.startsWith("Seeded") && !!p.signed_by;
    if (!p.signed_by || (!seeded && (!p.decision_id || !decisions.has(p.decision_id)))) unsigned += meds;
  }
  return { total_med_plan_items: total, unsigned };
}

// ---------------- modules ----------------
export async function listModuleVersions(db: DB): Promise<ModuleVersionRecord[]> {
  return d<ModuleVersionRecord>(await db.select().from(t.moduleVersions).orderBy(asc(t.moduleVersions.module_id), asc(t.moduleVersions.version)));
}
export async function getModuleVersion(db: DB, module_id: string, version: string): Promise<ModuleVersionRecord | null> {
  const r = await db.select().from(t.moduleVersions).where(and(eq(t.moduleVersions.module_id, module_id), eq(t.moduleVersions.version, version))).limit(1);
  return r[0] ? (r[0].data as ModuleVersionRecord) : null;
}
export async function insertModuleVersion(db: DB, m: ModuleVersionRecord) {
  await db.insert(t.moduleVersions).values({ id: m.id, module_id: m.module_id, version: m.version, status: m.status, created_at: m.created_at, data: m });
}
export async function setModuleStatus(db: DB, m: ModuleVersionRecord, status: ModuleVersionRecord["status"]) {
  await db.update(t.moduleVersions).set({ status, data: { ...m, status } }).where(eq(t.moduleVersions.id, m.id));
}
const manifestCache = new Map<string, Manifest>();
let cacheVer = -1;
export async function getActiveManifest(db: DB, module_id: string): Promise<Manifest | null> {
  if (cacheVer !== moduleCacheVersion()) { manifestCache.clear(); cacheVer = moduleCacheVersion(); }
  const hit = manifestCache.get(module_id);
  if (hit) return hit;
  const r = await db.select().from(t.moduleVersions).where(and(eq(t.moduleVersions.module_id, module_id), eq(t.moduleVersions.status, "active"))).orderBy(desc(t.moduleVersions.version)).limit(1);
  if (!r[0]) return null;
  const parsed = ManifestSchema.safeParse((r[0].data as ModuleVersionRecord).manifest);
  if (!parsed.success) return null;
  manifestCache.set(module_id, parsed.data);
  return parsed.data;
}

// ---------------- research ----------------
export async function listResearchRows(db: DB): Promise<{ patient_id: string; record: ResearchRecord }[]> {
  const r = await db.select().from(t.researchRecords).orderBy(asc(t.researchRecords.id));
  return r.map((x) => ({ patient_id: x.patient_id, record: x.data as ResearchRecord }));
}
export async function saveCohort(db: DB, c: CohortRecord) {
  await db.insert(t.cohorts).values({ id: c.id, hash: c.hash, created_by: c.created_by, created_at: c.created_at, data: c }).onConflictDoNothing();
}
export async function listCohorts(db: DB): Promise<CohortRecord[]> {
  return d<CohortRecord>(await db.select().from(t.cohorts).orderBy(desc(t.cohorts.created_at)));
}
export async function getCohort(db: DB, id: string): Promise<CohortRecord | null> {
  const r = await db.select().from(t.cohorts).where(eq(t.cohorts.id, id)).limit(1);
  return r[0] ? (r[0].data as CohortRecord) : null;
}
export async function upsertHypothesis(db: DB, h: HypothesisRecord) {
  await db.insert(t.hypotheses).values({ id: h.id, cohort_hash: h.cohort_hash, status: h.status, data: h }).onConflictDoNothing();
}
export async function getHypothesis(db: DB, id: string): Promise<HypothesisRecord | null> {
  const r = await db.select().from(t.hypotheses).where(eq(t.hypotheses.id, id)).limit(1);
  return r[0] ? (r[0].data as HypothesisRecord) : null;
}
export async function listHypotheses(db: DB, cohort_hash?: string): Promise<HypothesisRecord[]> {
  return d<HypothesisRecord>(await db.select().from(t.hypotheses).where(cohort_hash ? eq(t.hypotheses.cohort_hash, cohort_hash) : undefined).orderBy(asc(t.hypotheses.id)));
}
export async function setHypothesis(db: DB, h: HypothesisRecord) {
  await db.update(t.hypotheses).set({ status: h.status, data: h }).where(eq(t.hypotheses.id, h.id));
}

// ---------------- settings ----------------
export async function getSetting<T>(db: DB, key: string, fallback: T): Promise<T> {
  const r = await db.select().from(t.settings).where(eq(t.settings.key, key)).limit(1);
  return r[0] ? (r[0].data as T) : fallback;
}
export async function setSetting(db: DB, key: string, value: unknown) {
  await db.insert(t.settings).values({ key, data: value }).onConflictDoUpdate({ target: t.settings.key, set: { data: value } });
}
