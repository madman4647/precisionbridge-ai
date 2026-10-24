import type { Manifest } from "../modules/schema";
import type { AnswerValue } from "../types";

export interface CoerceResult { answers: Record<string, AnswerValue>; units: Record<string, string>; errors: string[] }

/** Validate and coerce raw form/API answers to the manifest's question types. Unknown ids are rejected. */
export function coerceAnswers(manifest: Manifest, rawAnswers: Record<string, unknown>, rawUnits: Record<string, unknown> = {}): CoerceResult {
  const answers: Record<string, AnswerValue> = {};
  const units: Record<string, string> = {};
  const errors: string[] = [];
  const known = new Map(manifest.checkin_question_schema.map((q) => [q.id, q]));
  for (const k of Object.keys(rawAnswers)) if (!known.has(k) && k !== "free_text") errors.push(`unknown question id: ${k}`);
  for (const q of manifest.checkin_question_schema) {
    if (q.id === "free_text") continue;
    const v = rawAnswers[q.id];
    if (v === undefined || v === null || v === "") continue; // missing stays missing — never imputed
    if (q.type === "number" || q.type === "scale" || (q.type === "choice" && q.min !== undefined)) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n)) { errors.push(`${q.id}: must be a number`); continue; }
      answers[q.id] = n;
    } else if (q.type === "boolean") {
      if (v === true || v === "true" || v === "yes") answers[q.id] = true;
      else if (v === false || v === "false" || v === "no") answers[q.id] = false;
      else errors.push(`${q.id}: must be yes/no`);
    } else if (q.type === "choice") {
      if (typeof v === "string" && q.choices?.some((c) => c.value === v)) answers[q.id] = v;
      else errors.push(`${q.id}: invalid choice`);
    } else if (q.type === "multi") {
      const arr = Array.isArray(v) ? v.map(String) : [String(v)];
      if (arr.every((x) => q.choices?.some((c) => c.value === x))) answers[q.id] = arr;
      else errors.push(`${q.id}: invalid choice`);
    } else answers[q.id] = String(v).slice(0, 2000);
    const u = rawUnits[q.id];
    if (typeof u === "string" && u) units[q.id] = u; // unit validity is judged by the engine (T17), not silently fixed here
  }
  return { answers, units, errors };
}
