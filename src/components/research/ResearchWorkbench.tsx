"use client";
import { useState } from "react";
import { Download, FlaskConical, Microscope, Search } from "lucide-react";
import { Badge, Banner, Button, Card, Field, Table, inputCls } from "@/components/ui";

interface Overview { condition_code: string; display_name: string; module_id: string; outcomes: { id: string; label: string; window_weeks: number; definition: string }[]; treatment_classes: { id: string; label: string }[] }
interface Cell { treatment_class: string; baseline_severity: string; suppressed: boolean; display_n: string; display_N: string; responders: number | null; missing_outcomes: number | null; proportion: number | null; ci: { lo: number; hi: number } | null }
interface Summary { definition_hash: string; result_hash: string; threshold: number; cells: Cell[]; total_in_displayed_cells: number; suppressed_cell_count: number; baseline_differences: { treatment_class: string; n: number | null; mean_baseline_score: number | null; pct_severe: number | null }[]; excluded_without_consent: number; caveats: string[]; plain_summary?: { text: string; source: string } }
interface Hyp { id: string; status: string; note?: string; candidate: { exposure: string; outcome: string; window: string; promoted: boolean; not_promoted_reason?: string; subgroup_n: { exposed_n: number | null; exposed_observed: number | null; comparison_observed: number | null }; observed_association: { exposed_proportion: number | null; comparison_proportion: number | null; difference: number | null; ci_note: string }; caveats: { key: string; label: string; flagged: boolean; note: string }[]; evidence_ids: string[]; literature_support: boolean; comparisons_tested: number; label: string } }
interface Saved { id: string; name: string; definition: { condition_code: string; endpoint_id: string; treatment_class?: string | null; baseline_severity?: string | null }; hash: string }
interface TrialRes { snapshot_date: string; source: string; features: Record<string, unknown>; results: { trial_id: string; title: string; status: string; last_update: string; criteria: { id: string; kind: string; text: string; verdict: string }[]; overall: string; note: string }[] }

const pct = (x: number | null) => (x === null ? "—" : `${(x * 100).toFixed(0)}%`);
const VERDICT: Record<string, string> = { appears_to_match: "Appears to match", appears_not_to_match: "Appears NOT to match", insufficient_information: "Insufficient information" };
const STATUS_LABEL: Record<string, string> = { queued: "Queued for review", dismissed: "Dismissed", needs_evidence: "Needs evidence", scientific_review_requested: "Scientific review requested", not_promoted: "Not promoted (small sample)" };

export function ResearchWorkbench({ overview, saved: initialSaved, threshold, snapshot }: { overview: Overview[]; saved: Saved[]; threshold: number; snapshot: { date: string; source: string } }) {
  const [tab, setTab] = useState<"cohort" | "hyp" | "trial">("cohort");
  const [cond, setCond] = useState(overview.find((o) => o.condition_code === "T2D")?.condition_code ?? overview[0].condition_code);
  const ov = overview.find((o) => o.condition_code === cond)!;
  const [endpoint, setEndpoint] = useState(ov.outcomes[0].id);
  const [tc, setTc] = useState(""); const [sev, setSev] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saved, setSaved] = useState(initialSaved);
  const [cohortId, setCohortId] = useState<string>("");
  const [name, setName] = useState("");
  const [hyps, setHyps] = useState<Hyp[]>([]);
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [cands, setCands] = useState<{ pseudo_id: string; age_band: string; baseline_severity: string }[]>([]);
  const [pseudo, setPseudo] = useState(""); const [trial, setTrial] = useState<TrialRes | null>(null);

  const def = { condition_code: cond, endpoint_id: endpoint, treatment_class: tc || null, baseline_severity: sev || null };
  async function j(url: string, init?: RequestInit) { const r = await fetch(url, { ...init, headers: { "content-type": "application/json" } }); return { ok: r.ok, body: await r.json().catch(() => ({})) }; }

  async function run() {
    setBusy(true); setMsg("");
    const { ok, body } = await j("/api/research/query", { method: "POST", body: JSON.stringify(def) });
    setBusy(false);
    if (ok) { setSummary(body.data); setCohortId(`coh_${body.data.definition_hash}`); } else setMsg(body.error ?? "Query failed");
  }
  async function save() {
    const { ok, body } = await j("/api/research/cohorts", { method: "POST", body: JSON.stringify({ name, definition: def }) });
    if (ok) { setSaved([body.data, ...saved.filter((s) => s.id !== body.data.id)]); setCohortId(body.data.id); setMsg(`Saved reproducible definition ${body.data.id}.`); } else setMsg(body.error ?? "Save failed");
  }
  function load(s: Saved) { setCond(s.definition.condition_code); setEndpoint(s.definition.endpoint_id); setTc(s.definition.treatment_class ?? ""); setSev(s.definition.baseline_severity ?? ""); setCohortId(s.id); setMsg(`Loaded ${s.name}. Press Run to recompute — same definition gives identical counts.`); }
  async function genHyp() {
    if (!saved.some((s) => s.id === cohortId)) { setMsg("Save the cohort definition first (hypotheses attach to a saved, reproducible cohort)."); return; }
    setBusy(true); const { ok, body } = await j(`/api/research/cohorts/${cohortId}/hypotheses`, { method: "POST" }); setBusy(false);
    if (ok) setHyps(body.data); else setMsg(body.error ?? "failed");
  }
  async function dispose(id: string, disposition: string) {
    const { ok, body } = await j(`/api/hypotheses/${id}`, { method: "PATCH", body: JSON.stringify({ disposition }) });
    if (ok) setHyps(hyps.map((h) => (h.id === id ? body.data : h))); else setMsg(body.error ?? "failed");
  }
  async function loadCands() { const { ok, body } = await j(`/api/research/trials/candidates?condition=${cond}`); if (ok) { setCands(body.data); setPseudo(body.data[0]?.pseudo_id ?? ""); setTrial(null); } }
  async function prescreen() { const { ok, body } = await j("/api/research/trials/prescreen", { method: "POST", body: JSON.stringify({ pseudo_id: pseudo }) }); if (ok) setTrial(body.data); else setMsg(body.error ?? "failed"); }

  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Research workbench</h1><p className="text-muted">Consent-authorised, de-identified, synthetic aggregates only. No direct identifiers. No route from here into any patient&apos;s care.</p></div>
      <Banner tone="warn" title="Confounding by indication · not causal evidence">Treatment was not randomised and the data are synthetic. Associations — including any apparent subgroup &ldquo;winner&rdquo; — are exploratory only and are not evidence of efficacy.</Banner>
      <div role="tablist" aria-label="Workbench sections" className="flex flex-wrap gap-1">
        {([["cohort", "Cohort builder", Search], ["hyp", "Hypothesis queue (P1)", FlaskConical], ["trial", "Trial pre-screen (P1)", Microscope]] as const).map(([k, l, I]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${tab === k ? "bg-brand text-white" : "border border-line bg-white"}`}><I size={14} aria-hidden /> {l}</button>
        ))}
      </div>
      {msg && <Banner tone="info"><span role="status">{msg}</span></Banner>}

      {tab === "cohort" && (
        <>
          <Card title="Define cohort and a single explicit endpoint">
            <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); run(); }}>
              <Field label="Condition" htmlFor="c"><select id="c" className={inputCls} value={cond} onChange={(e) => { setCond(e.target.value); const o = overview.find((x) => x.condition_code === e.target.value)!; setEndpoint(o.outcomes[0].id); setTc(""); }}>{overview.map((o) => <option key={o.condition_code} value={o.condition_code}>{o.display_name}</option>)}</select></Field>
              <Field label="Endpoint (8-week window)" htmlFor="e" hint={ov.outcomes.find((o) => o.id === endpoint)?.definition}><select id="e" className={inputCls} value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>{ov.outcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></Field>
              <Field label="Treatment class (optional)" htmlFor="t"><select id="t" className={inputCls} value={tc} onChange={(e) => setTc(e.target.value)}><option value="">All classes</option>{ov.treatment_classes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></Field>
              <Field label="Baseline severity (optional)" htmlFor="s"><select id="s" className={inputCls} value={sev} onChange={(e) => setSev(e.target.value)}><option value="">All</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select></Field>
              <div className="md:col-span-4 flex flex-wrap items-end gap-2">
                <Button type="submit" disabled={busy}>Run cohort</Button>
                <input aria-label="Cohort name" placeholder="Name to save…" className={`${inputCls} max-w-xs`} value={name} onChange={(e) => setName(e.target.value)} />
                <Button type="button" variant="secondary" onClick={save}>Save definition</Button>
              </div>
            </form>
            {saved.length > 0 && <div className="mt-3"><p className="text-sm font-medium">Saved definitions</p><ul className="mt-1 flex flex-wrap gap-2">{saved.map((s) => <li key={s.id}><button className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold" onClick={() => load(s)}>{s.name} · {s.definition.condition_code}</button></li>)}</ul></div>}
          </Card>

          {summary && (
            <Card title="Subgroup response (descriptive)" actions={cohortId && saved.some((s) => s.id === cohortId) ? <span className="flex gap-2 text-sm"><a className="inline-flex items-center gap-1 underline" href={`/api/research/cohorts/${cohortId}/export?format=csv`}><Download size={14} aria-hidden /> CSV</a><a className="inline-flex items-center gap-1 underline" href={`/api/research/cohorts/${cohortId}/export?format=pdf`}><Download size={14} aria-hidden /> PDF</a></span> : undefined}>
              {summary.plain_summary && <p className="mb-3 rounded bg-slate-50 p-2 text-sm"><Badge>{summary.plain_summary.source === "llm" ? "AI plain-language summary (numbers validated)" : "Summary"}</Badge> {summary.plain_summary.text}</p>}
              <Table head={["Treatment class", "Baseline", "n", "N with outcome", "Responders", "Missing outcomes", "Proportion", "95% CI (Wilson)"]} caption={`Cells with fewer than ${summary.threshold} are suppressed ("<${summary.threshold}"). Definition ${summary.definition_hash}; result ${summary.result_hash}.`}>
                {summary.cells.map((c, i) => (
                  <tr key={i} className={c.suppressed ? "bg-slate-50 text-muted" : ""}>
                    <td className="px-2 py-2">{ov.treatment_classes.find((t) => t.id === c.treatment_class)?.label ?? c.treatment_class}</td><td className="px-2 py-2 capitalize">{c.baseline_severity}</td>
                    <td className="px-2 py-2">{c.display_n}</td><td className="px-2 py-2">{c.display_N}</td><td className="px-2 py-2">{c.suppressed ? "—" : c.responders ?? "—"}</td><td className="px-2 py-2">{c.suppressed ? "—" : c.missing_outcomes ?? "—"}</td>
                    <td className="px-2 py-2">{pct(c.proportion)}</td><td className="px-2 py-2">{c.ci ? `${pct(c.ci.lo)}–${pct(c.ci.hi)}` : c.suppressed ? "suppressed" : `n/a (N<${summary.threshold})`}</td>
                  </tr>
                ))}
              </Table>
              <p className="mt-2 text-xs text-muted">{summary.suppressed_cell_count} suppressed cell(s). Total shown = {summary.total_in_displayed_cells} (displayed cells only). {summary.excluded_without_consent} record(s) excluded because research consent is not granted (logged, no identities).</p>
              <h3 className="mt-4 text-sm font-semibold">Baseline differences between treatment classes</h3>
              <Table head={["Treatment class", "n", "Mean baseline score", "% severe"]}>
                {summary.baseline_differences.map((b) => <tr key={b.treatment_class}><td className="px-2 py-1.5">{ov.treatment_classes.find((t) => t.id === b.treatment_class)?.label ?? b.treatment_class}</td><td className="px-2 py-1.5">{b.n ?? `<${summary.threshold} / withheld`}</td><td className="px-2 py-1.5">{b.mean_baseline_score ?? "—"}</td><td className="px-2 py-1.5">{b.pct_severe === null ? "—" : `${b.pct_severe}%`}</td></tr>)}
              </Table>
              <ul className="mt-3 list-disc pl-5 text-xs text-muted">{summary.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
            </Card>
          )}
        </>
      )}

      {tab === "hyp" && (
        <Card title="Exploratory hypothesis queue" actions={<Button onClick={genHyp} disabled={busy}>Scan saved cohort for signals</Button>}>
          <Banner tone="danger" title="Demonstration-only; not evidence of efficacy.">Candidates are research questions for human scientific review. They cannot reach patient option cards or any care plan.</Banner>
          {hyps.length === 0 && <p className="mt-3 text-sm text-muted">Run and save a cohort in the Cohort builder, then scan it. {threshold > 1 && `Groups below ${threshold} are suppressed and not promoted.`}</p>}
          <ul className="mt-3 space-y-4">
            {hyps.map((h) => (
              <li key={h.id} className="rounded-xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{h.candidate.exposure} → {h.candidate.outcome} ({h.candidate.window})</h3><Badge tone={h.status === "queued" ? "amber" : h.status === "not_promoted" ? "slate" : "teal"}>{STATUS_LABEL[h.status]}</Badge><Badge tone="red">Exploratory only</Badge></div>
                {h.candidate.promoted ? (
                  <p className="mt-1 text-sm">Signal: {pct(h.candidate.observed_association.exposed_proportion)} vs {pct(h.candidate.observed_association.comparison_proportion)} (difference {h.candidate.observed_association.difference === null ? "—" : `${(h.candidate.observed_association.difference * 100).toFixed(0)} pts`}). Sample: exposed n={h.candidate.subgroup_n.exposed_n}, with outcome {h.candidate.subgroup_n.exposed_observed}; comparison {h.candidate.subgroup_n.comparison_observed}. {h.candidate.observed_association.ci_note}. Literature in approved catalog: {h.candidate.literature_support ? h.candidate.evidence_ids.join(", ") : "none — no supporting evidence in the catalog"}.</p>
                ) : <p className="mt-1 text-sm text-muted">{h.candidate.not_promoted_reason} Cell values suppressed.</p>}
                <details className="mt-2 text-sm" open><summary className="font-medium">Caveats checklist ({h.candidate.comparisons_tested} comparisons screened)</summary>
                  <ul className="mt-1 grid gap-1 sm:grid-cols-2">{h.candidate.caveats.map((c) => <li key={c.key} className="rounded bg-slate-50 p-1.5"><strong>{c.flagged ? "⚑ " : "○ "}{c.label}:</strong> {c.note}</li>)}</ul></details>
                {h.candidate.promoted && h.status === "queued" && <div className="mt-3 flex flex-wrap gap-2">{[["dismiss", "Dismiss"], ["needs_evidence", "Needs evidence"], ["request_scientific_review", "Request scientific review"]].map(([v, l]) => <Button key={v} variant="secondary" onClick={() => dispose(h.id, v)}>{l}</Button>)}</div>}
                {h.status !== "queued" && h.status !== "not_promoted" && <p className="mt-2 text-xs text-muted">Disposition recorded. Nothing is routed to clinical care.</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "trial" && (
        <Card title="Trial pre-screen against a dated mock registry snapshot">
          <Banner tone="warn" title={`Snapshot dated ${snapshot.date}`}>{snapshot.source}. Recruitment status may have changed. Eligibility must be confirmed by the trial team; nothing here implies enrollment.</Banner>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Button variant="secondary" onClick={loadCands}>Load consented pseudonymous records ({ov.display_name})</Button>
            {cands.length > 0 && <><select aria-label="Pseudonymous record" className={`${inputCls} max-w-xs`} value={pseudo} onChange={(e) => setPseudo(e.target.value)}>{cands.map((c) => <option key={c.pseudo_id} value={c.pseudo_id}>{c.pseudo_id} · {c.age_band} · {c.baseline_severity}</option>)}</select><Button onClick={prescreen}>Pre-screen</Button></>}
          </div>
          {trial && <div className="mt-4 space-y-4">{trial.results.map((r) => (
            <div key={r.trial_id} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{r.trial_id}: {r.title}</h3><Badge tone={r.status === "Recruiting" ? "green" : "amber"}>{r.status}</Badge><span className="text-xs text-muted">Registry last update {r.last_update} · snapshot {trial.snapshot_date}</span></div>
              <Table head={["Criterion", "Type", "Assessment"]}>{r.criteria.map((c) => <tr key={c.id}><td className="px-2 py-1.5">{c.text}</td><td className="px-2 py-1.5">{c.kind}</td><td className="px-2 py-1.5"><Badge tone={c.verdict === "appears_to_match" ? "green" : c.verdict === "appears_not_to_match" ? "red" : "amber"}>{VERDICT[c.verdict]}</Badge></td></tr>)}</Table>
              <p className="mt-2 text-sm"><strong>Overall:</strong> {r.overall}. <span className="text-muted">{r.note}</span></p>
            </div>))}</div>}
        </Card>
      )}
    </div>
  );
}
