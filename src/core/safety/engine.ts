import type { Manifest } from "../modules/schema";
import { evalCond, type Resolved } from "../modules/dsl";
import { ENGINE_VERSION, type AnswerValue, type CheckInInput, type Observation, type RiskEvaluation, type SafetyState } from "../types";

const LIMITATIONS = [
  "Deterministic rules with demo thresholds — not clinically validated.",
  "No triggered rule does not rule out illness.",
  "Free text can only escalate, never down-classify.",
];

export function isMissingAnswer(v: AnswerValue | undefined): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

interface Normalised {
  observations: Observation[];
  obs: Record<string, number>;
  issues: string[];
}

/** Unit normalisation + plausibility checks (T17). Suspect values are excluded from computation. */
export function normaliseObservations(manifest: Manifest, c: CheckInInput): Normalised {
  const observations: Observation[] = [];
  const obs: Record<string, number> = {};
  const issues: string[] = [];
  const observed_at = c.observed_at ?? c.created_at;
  for (const q of manifest.checkin_question_schema) {
    if (!q.concept) continue;
    const raw = c.answers[q.id];
    if (isMissingAnswer(raw)) continue;
    const def = manifest.measure_definitions.find((d) => d.concept === q.concept);
    if (!def) continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    const unit = c.units[q.id] ?? q.unit ?? def.canonical_unit;
    const base = { concept: q.concept, value, unit, observed_at, verification_status: "unverified" as const };
    if (!Number.isFinite(value)) {
      observations.push({ ...base, value: Number.NaN, excluded: true, exclusion_reason: "not a number" });
      issues.push(`${q.id}: value is not a number`);
      continue;
    }
    const factor = def.units[unit];
    if (factor === undefined) {
      observations.push({ ...base, excluded: true, exclusion_reason: `unit "${unit}" not recognised` });
      issues.push(`${q.id}: unit "${unit}" not recognised for ${def.label}`);
      continue;
    }
    const canonical = value * factor;
    if (canonical < def.plausible_min || canonical > def.plausible_max) {
      observations.push({ ...base, excluded: true, exclusion_reason: `implausible for unit ${unit}` });
      issues.push(`${q.id}: value ${value} ${unit} is implausible — possible unit/entry error; excluded until resolved`);
      continue;
    }
    observations.push(base);
    obs[q.concept] = Math.round(canonical * 100) / 100;
  }
  return { observations, obs, issues };
}

export interface EvalContext {
  now?: Date;
  id?: string;
}

/** Pure, synchronous rules evaluation. Throws are caught by `runSafety` (fail closed). */
export function evaluateRules(manifest: Manifest, c: CheckInInput, ctx: EvalContext = {}): RiskEvaluation {
  const evaluated_at = (ctx.now ?? new Date()).toISOString();
  const norm = normaliseObservations(manifest, c);

  const derived: Record<string, number | null> = {};
  for (const d of manifest.derived_measures) {
    const vals = d.of.map((p) => { const [ns, k] = p.split("."); return ns === "obs" ? norm.obs[k] : c.answers[k]; });
    derived[d.id] = vals.every((v) => typeof v === "number") ? (d.op === "diff" ? vals[0] - (vals[1] as number) : (vals as number[]).reduce((a, b) => a + b, 0)) : null;
  }

  const resolve = (path: string): Resolved => {
    const [ns, key] = path.split(".");
    let value: unknown;
    if (ns === "answers") value = c.answers[key];
    else if (ns === "obs") value = norm.obs[key];
    else if (ns === "derived") value = derived[key];
    if (isMissingAnswer(value as AnswerValue)) value = null;
    // Booleans from forms may arrive as "yes"/"no"
    if (value === "yes") value = true;
    if (value === "no") value = false;
    return { value, verified: false };
  };

  const missing: string[] = [];
  for (const q of manifest.checkin_question_schema) {
    if (q.required && isMissingAnswer(c.answers[q.id])) missing.push(q.id);
  }
  for (const q of manifest.checkin_question_schema) {
    if (q.concept && !isMissingAnswer(c.answers[q.id]) && !(q.concept in norm.obs) && q.required && !missing.includes(q.id)) missing.push(q.id);
  }

  const contradictions: string[] = [...norm.issues];
  for (const r of manifest.consistency_rules) {
    if (evalCond(r.when, resolve).result === "true") contradictions.push(`${r.id}: ${r.message}`);
  }

  const triggered: { id: string; state: SafetyState; msg: string; why: string }[] = [];
  for (const r of manifest.red_flag_rules) {
    if (evalCond(r.when, resolve).result === "true") triggered.push({ id: r.id, state: r.state, msg: r.patient_message_id, why: `${r.id}: ${r.rationale}` });
  }
  // Free text is escalate-only (T06): it can never reduce the state.
  for (const k of manifest.free_text_keywords) {
    if (c.free_text && new RegExp(k.pattern, "i").test(c.free_text)) {
      triggered.push({ id: k.id, state: k.state, msg: "free_text_review", why: `${k.id}: free text matched a review keyword (escalation only)` });
    }
  }

  let state: SafetyState;
  const rationale: string[] = [];
  if (triggered.some((t) => t.state === "URGENT")) state = "URGENT";
  else if (missing.length || contradictions.length) state = "UNABLE_TO_ASSESS";
  else if (triggered.length) state = "PROMPT_REVIEW";
  else state = "ROUTINE";

  if (triggered.length) rationale.push(...triggered.map((t) => t.why));
  if (missing.length) rationale.push(`Missing required answers: ${missing.join(", ")}`);
  if (contradictions.length) rationale.push(`Data conflicts: ${contradictions.join("; ")}`);
  if (state === "ROUTINE") rationale.push("No rule triggered. This does not rule out illness.");

  const messageIds = new Set(triggered.map((t) => t.msg));
  const patient_message_ids = state === "URGENT" ? [...messageIds] : state === "ROUTINE" ? ["routine"] : [...messageIds, state === "UNABLE_TO_ASSESS" ? "unable_to_assess" : "prompt_review"];

  return {
    id: ctx.id ?? `re_${c.id}`,
    checkin_id: c.id,
    module_id: manifest.module_id,
    module_version: manifest.module_version,
    engine_version: ENGINE_VERSION,
    state,
    triggered_rule_ids: triggered.map((t) => t.id),
    missing_fields: missing,
    contradictions,
    data_quality_issues: norm.issues,
    patient_message_ids,
    rationale,
    observations: norm.observations,
    evaluated_at,
    source: "deterministic_rules_engine",
    limitations: LIMITATIONS,
  };
}

export interface SafetyDeps {
  evaluator?: (m: Manifest, c: CheckInInput, ctx: EvalContext) => RiskEvaluation | Promise<RiskEvaluation>;
  timeoutMs?: number;
  now?: Date;
}

export function failClosed(manifest: Manifest | null, c: CheckInInput, error: string, now: Date = new Date()): RiskEvaluation {
  return {
    id: `re_${c.id}`,
    checkin_id: c.id,
    module_id: manifest?.module_id ?? c.module_id,
    module_version: manifest?.module_version ?? "unknown",
    engine_version: ENGINE_VERSION,
    state: "UNABLE_TO_ASSESS",
    triggered_rule_ids: [],
    missing_fields: [],
    contradictions: [],
    data_quality_issues: [],
    patient_message_ids: ["unable_to_assess"],
    rationale: ["Safety service could not complete (fail closed). Routed for clinician review."],
    observations: [],
    evaluated_at: now.toISOString(),
    error,
    source: "deterministic_rules_engine",
    limitations: LIMITATIONS,
  };
}

/** Any engine error or timeout => UNABLE_TO_ASSESS (T15). */
export async function runSafety(manifest: Manifest | null, c: CheckInInput, deps: SafetyDeps = {}): Promise<RiskEvaluation> {
  const timeoutMs = deps.timeoutMs ?? 2000;
  const now = deps.now ?? new Date();
  if (!manifest) return failClosed(null, c, "module not available", now);
  const evaluator = deps.evaluator ?? evaluateRules;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => evaluator(manifest, c, { now })),
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`safety evaluation exceeded ${timeoutMs}ms`)), timeoutMs); }),
    ]);
    if (!result || !["URGENT", "PROMPT_REVIEW", "ROUTINE", "UNABLE_TO_ASSESS"].includes(result.state)) throw new Error("engine returned invalid state");
    return result;
  } catch (e) {
    return failClosed(manifest, c, e instanceof Error ? e.message : "unknown error", now);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
