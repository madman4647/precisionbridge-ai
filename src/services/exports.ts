import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { WATERMARK } from "@/core/types";
import { audit, fail, guard, guardPatient, ok, type Ctx } from "./context";
import { getCohortSummary } from "./research";
import { getActiveManifest, latestPlan, listEvaluations, listComparisons, listDecisions } from "@/db/repo";

const ascii = (s: string) => s.replace(/[—–]/g, "-").replace(/→/g, "->").replace(/≥/g, ">=").replace(/≤/g, "<=").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/·/g, "-").replace(/[^\x20-\x7E]/g, "?");
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export interface ExportFile { filename: string; contentType: string; body: Uint8Array | string }

async function pdf(title: string, lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 800;
  const mark = (p: typeof page) => { p.drawText(WATERMARK, { x: 40, y: 20, size: 9, font: bold, color: rgb(0.7, 0.1, 0.1) }); p.drawText(WATERMARK, { x: 70, y: 350, size: 34, font: bold, color: rgb(0.93, 0.85, 0.85), rotate: { type: "degrees" as any, angle: 35 } }); };
  mark(page);
  page.drawText(ascii(title), { x: 40, y, size: 15, font: bold }); y -= 28;
  for (const raw of lines) {
    for (const line of wrap(ascii(raw), 95)) {
      if (y < 50) { page = doc.addPage([595, 842]); mark(page); y = 800; }
      page.drawText(line, { x: 40, y, size: 9.5, font }); y -= 13;
    }
  }
  return doc.save();
}
function wrap(s: string, n: number): string[] {
  if (s.length <= n) return [s];
  const out: string[] = []; let cur = "";
  for (const w of s.split(" ")) { if ((cur + " " + w).trim().length > n) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) out.push(cur); return out;
}

export async function exportCohort(ctx: Ctx, id: string, format: "csv" | "pdf") {
  const g = await guard(ctx, "research.export", { type: "cohort_export", id });
  if (!g.ok) return g;
  const r = await getCohortSummary(ctx, id);
  if (!r.ok) return r;
  const { cohort, summary } = r.data;
  const meta = [
    WATERMARK, `Scope: consent-authorised, de-identified synthetic records; condition ${summary.definition.condition_code}; endpoint ${summary.definition.endpoint_id}; window ${summary.definition.window_weeks} weeks`,
    `Cohort: ${cohort.name} (${cohort.id}); definition hash ${summary.definition_hash}; result hash ${summary.result_hash}`, `Small-cell threshold: ${summary.threshold}`,
    "Review status: NOT scientifically reviewed - exploratory and descriptive only", `Generated: ${new Date().toISOString()}`, ...summary.caveats,
  ];
  await audit(ctx, { action: "research.export", outcome: "success", actor_id: g.data.id, actor_role: g.data.role, resource_type: "cohort", resource_id: id, details: { format, result_hash: summary.result_hash } });
  const rows = summary.cells.map((c) => [c.treatment_class, c.baseline_severity, c.display_n, c.display_N, c.suppressed ? "" : c.responders ?? "", c.suppressed ? "" : c.missing_outcomes ?? "", c.proportion === null ? "" : (c.proportion * 100).toFixed(1) + "%", c.ci ? `${(c.ci.lo * 100).toFixed(0)}-${(c.ci.hi * 100).toFixed(0)}%` : ""]);
  if (format === "csv") {
    const body = [...meta.map((m) => csvCell(`# ${m}`)), ["treatment_class", "baseline_severity", "n", "N_observed", "responders", "missing_outcomes", "proportion", "wilson_95ci"].map(csvCell).join(","), ...rows.map((rw) => rw.map(csvCell).join(","))].join("\n");
    return ok<ExportFile>({ filename: `cohort-${id}.csv`, contentType: "text/csv; charset=utf-8", body });
  }
  const bytes = await pdf("PrecisionBridge AI - Cohort summary", [...meta, "", ...rows.map((rw) => rw.join(" | "))]);
  return ok<ExportFile>({ filename: `cohort-${id}.pdf`, contentType: "application/pdf", body: bytes });
}

export async function exportClinicianSummary(ctx: Ctx, patient_id: string, format: "csv" | "pdf") {
  const g = await guardPatient(ctx, "export.clinician_summary", patient_id);
  if (!g.ok) return g;
  const { patient, actor } = g.data;
  const [manifest, evals, comps, decisions, plan] = await Promise.all([getActiveManifest(ctx.db, patient.module_id), listEvaluations(ctx.db, patient_id), listComparisons(ctx.db, patient_id), listDecisions(ctx.db, patient_id), latestPlan(ctx.db, patient_id)]);
  const ev = evals[evals.length - 1];
  const comp = comps[0];
  const lines = [
    WATERMARK, `Patient: ${patient.display_name}`, `Module: ${patient.module_id}@${manifest?.module_version ?? "?"} (illustrative content - pending clinical review)`, `Scope: clinician-only summary for assigned clinician ${actor.display_name}`,
    `Latest safety state: ${ev?.state ?? "none"} (rules: ${ev?.triggered_rule_ids.join(", ") || "none"})`, `Comparison review status: ${comp ? comp.review_state : "none"} ${comp ? `(evidence ${comp.result.evidence_version})` : ""}`,
    `Latest signed plan: ${plan ? `v${plan.version} signed ${plan.signed_at.slice(0, 10)} by ${plan.signed_by}` : "none"}`, `Signed decisions: ${decisions.length}`, "",
    ...(comp ? ["Potential options to consider (clinician review only; no doses, no success probabilities):", ...comp.result.cards.map((c) => `- ${c.label} [${c.status}] evidence: ${c.evidence.map((e) => `${e.guideline_source_id} (${e.published})`).join(", ")}`)] : []),
  ];
  await audit(ctx, { action: "export.generated", outcome: "success", actor_id: actor.id, actor_role: actor.role, resource_type: "patient", resource_id: patient_id, details: { format, kind: "clinician_summary" } });
  if (format === "csv") return ok<ExportFile>({ filename: `summary-${patient_id}.csv`, contentType: "text/csv; charset=utf-8", body: lines.map((l) => csvCell(l)).join("\n") });
  return ok<ExportFile>({ filename: `summary-${patient_id}.pdf`, contentType: "application/pdf", body: await pdf("PrecisionBridge AI - Clinician summary", lines) });
}

export { fail };
