import { audit, fail, guardPatient, ok, type Ctx } from "./context";
import { getActiveManifest } from "@/db/repo";
import { hashString } from "@/core/research/stats";

/**
 * Optional LLM (F21 + plain-language summaries). The LLM never sets safety state, creates option cards or invents evidence.
 * Output is validated; on any failure the original approved/deterministic text is used.
 */
const MODEL = "claude-haiku-5-5";

async function callModel(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const j: any = await res.json();
    return typeof j?.content?.[0]?.text === "string" ? j.content[0].text.trim() : null;
  } catch { return null; }
}

const nums = (s: string) => (s.match(/\d+(\.\d+)?/g) ?? []).sort().join(",");

export function validateParaphrase(original: string, candidate: string | null): string {
  if (!candidate) return original;
  const c = candidate.replace(/^["']|["']$/g, "").trim();
  if (c.length < 8 || c.length > Math.max(160, original.length * 2)) return original;
  if (nums(c) !== nums(original)) return original; // must not change any numbers
  if (/\b(mg|dose|take|stop taking|increase|decrease|prescri\w+)\b/i.test(c)) return original; // no medication directives
  if (/[\n\r]/.test(c)) return original;
  return c;
}

export async function paraphraseQuestions(ctx: Ctx, patient_id: string) {
  const g = await guardPatient(ctx, "checkin.create", patient_id);
  if (!g.ok) return g;
  const m = await getActiveManifest(ctx.db, g.data.patient.module_id);
  if (!m) return fail(404, "module not active");
  const out: Record<string, { text: string; source: "llm" | "approved_text" }> = {};
  for (const q of m.checkin_question_schema) {
    // Safety-critical questions and structured response capture are never reworded.
    if (q.safety_critical || q.type === "text" || q.id.startsWith("phq9_")) { out[q.id] = { text: q.text, source: "approved_text" }; continue; }
    const cand = process.env.ANTHROPIC_API_KEY ? await callModel("You rephrase patient check-in questions in warmer plain language. Keep exactly the same meaning, same numbers and same answer scale. Output only the rewritten question, one line, no medication advice.", q.text) : null;
    const text = validateParaphrase(q.text, cand);
    out[q.id] = { text, source: text === q.text ? "approved_text" : "llm" };
  }
  await audit(ctx, { action: "ai.output", outcome: "success", actor_id: "system", actor_role: "system", resource_type: "checkin_questions", resource_id: patient_id, module_id: m.module_id, module_version: m.module_version, details: { llm_enabled: !!process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_API_KEY ? MODEL : null, rewritten: Object.entries(out).filter(([, v]) => v.source === "llm").map(([k, v]) => ({ id: k, hash: hashString(v.text) })) } });
  return ok(out);
}

export function deterministicCohortSummary(s: { cells: { treatment_class: string; baseline_severity: string; suppressed: boolean; n: number | null; proportion: number | null }[]; suppressed_cell_count: number }): string {
  const shown = s.cells.filter((c) => !c.suppressed && c.proportion !== null);
  const parts = shown.slice(0, 4).map((c) => `${c.treatment_class} / ${c.baseline_severity}: ${Math.round((c.proportion ?? 0) * 100)}% met the endpoint (n=${c.n})`);
  return `${parts.join("; ") || "No cells met the display threshold."} ${s.suppressed_cell_count} cell(s) are suppressed (<threshold). These are descriptive, unadjusted figures on synthetic data; they are not evidence that any treatment works.`;
}

export async function plainCohortSummary(ctx: Ctx, base: string) {
  const cand = await callModel("Rewrite this research summary in plain language for a non-specialist. Keep every number exactly, and keep the statement that the figures are descriptive, synthetic and not evidence of efficacy. Output 2-4 sentences.", base);
  if (!cand || nums(cand) !== nums(base) || !/not evidence/i.test(cand) || cand.length > base.length * 2) return { text: base, source: "deterministic" as const };
  await audit(ctx, { action: "ai.output", outcome: "success", actor_id: "system", actor_role: "system", resource_type: "cohort_summary", details: { model: MODEL, hash: hashString(cand) } });
  return { text: cand, source: "llm" as const };
}
