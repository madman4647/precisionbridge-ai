"use client";
import { useEffect, useState } from "react";
import { Banner, Button, Field, StateBadge, inputCls } from "@/components/ui";
import { Sparkles } from "lucide-react";

interface Q { id: string; text: string; type: string; unit?: string; allowed_units?: string[]; choices?: { value: string; label: string }[]; min?: number; max?: number; required: boolean; safety_critical: boolean }
interface Result { state: string; messages: string[]; emergency: { headline: string; body: string; notice: string; status: string } | null; clinician_alert_recorded: boolean; acknowledged: boolean; notes: string[]; evaluation: { id: string; triggered_rule_ids: string[]; missing_fields: string[]; module_version: string } }

export function CheckInForm({ patientId, questions }: { patientId: string; questions: Q[] }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [units, setUnits] = useState<Record<string, string>>(() => Object.fromEntries(questions.filter((q) => q.unit).map((q) => [q.id, q.unit!])));
  const [freeText, setFreeText] = useState("");
  const [texts, setTexts] = useState<Record<string, { text: string; source: string }>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { fetch(`/api/patients/${patientId}/questions`).then((r) => r.json()).then((j) => j.data && setTexts(j.data)).catch(() => {}); }, [patientId]);
  const set = (id: string, v: unknown) => setAnswers((a) => ({ ...a, [id]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch(`/api/patients/${patientId}/checkins`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers, units, free_text: freeText }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Could not submit"); return; }
    setResult(j.data);
  }

  if (result) return <ResultView r={result} onAgain={() => { setResult(null); setAnswers({}); }} />;

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <Banner tone="info" title="About 1–2 minutes">Questions you skip are recorded as missing — never assumed fine. Your clinician reviews your answers; this is not live monitoring.</Banner>
      {questions.filter((q) => q.id !== "free_text").map((q, idx) => {
        const label = texts[q.id]?.text ?? q.text;
        const ai = texts[q.id]?.source === "llm";
        const lab = <span>{idx + 1}. {label} {ai && <span className="ml-1 inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 text-xs text-violet-900"><Sparkles size={11} aria-hidden /> reworded by AI</span>}</span>;
        if (q.type === "boolean") return (
          <fieldset key={q.id} className="space-y-1"><legend className="text-sm font-medium">{lab}</legend>
            <div className="flex gap-4">{[["true", "Yes"], ["false", "No"]].map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm"><input type="radio" name={q.id} value={v} checked={String(answers[q.id]) === v} onChange={() => set(q.id, v === "true")} /> {l}</label>)}</div></fieldset>);
        if (q.type === "choice") return (
          <fieldset key={q.id} className="space-y-1"><legend className="text-sm font-medium">{lab}</legend>
            <div className="flex flex-wrap gap-3">{q.choices!.map((c) => <label key={c.value} className="flex items-center gap-2 text-sm"><input type="radio" name={q.id} value={c.value} checked={String(answers[q.id]) === c.value} onChange={() => set(q.id, c.value)} /> {c.label}</label>)}</div></fieldset>);
        if (q.type === "multi") return (
          <fieldset key={q.id} className="space-y-1"><legend className="text-sm font-medium">{lab}</legend>
            <div className="flex flex-wrap gap-3">{q.choices!.map((c) => { const cur = (answers[q.id] as string[]) ?? []; return <label key={c.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cur.includes(c.value)} onChange={(e) => set(q.id, e.target.checked ? [...cur, c.value] : cur.filter((x) => x !== c.value))} /> {c.label}</label>; })}</div></fieldset>);
        if (q.type === "scale") return (
          <Field key={q.id} label={lab} htmlFor={q.id}><select id={q.id} className={inputCls} value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value === "" ? undefined : Number(e.target.value))}><option value="">Skip</option>{Array.from({ length: (q.max ?? 5) - (q.min ?? 1) + 1 }, (_, i) => (q.min ?? 1) + i).map((n) => <option key={n} value={n}>{n}</option>)}</select></Field>);
        return (
          <Field key={q.id} label={lab} htmlFor={q.id} hint={q.safety_critical ? "Safety question — please answer if you can." : undefined}>
            <div className="flex gap-2"><input id={q.id} type="number" inputMode="decimal" step="any" className={inputCls} value={String(answers[q.id] ?? "")} onChange={(e) => set(q.id, e.target.value === "" ? undefined : Number(e.target.value))} />
              {q.allowed_units && q.allowed_units.length > 1 ? <select aria-label={`${q.id} unit`} className="rounded-lg border border-line bg-white px-2 text-sm" value={units[q.id]} onChange={(e) => setUnits({ ...units, [q.id]: e.target.value })}>{q.allowed_units.map((u) => <option key={u}>{u}</option>)}</select> : q.unit ? <span className="self-center text-sm text-muted">{q.unit}</span> : null}</div>
          </Field>);
      })}
      <Field label="Anything else you want your care team to know? (optional)" htmlFor="free"><textarea id="free" rows={3} className={inputCls} value={freeText} onChange={(e) => setFreeText(e.target.value)} /></Field>
      {err && <Banner tone="danger" title="Could not submit">{err}</Banner>}
      <Button type="submit" disabled={busy}>{busy ? "Checking…" : "Submit check-in"}</Button>
    </form>
  );
}

function ResultView({ r, onAgain }: { r: Result; onAgain: () => void }) {
  return (
    <div className="space-y-4" aria-live="assertive">
      <div className="flex items-center gap-3"><h2 className="text-xl font-bold">Check-in result</h2><StateBadge state={r.state} /></div>
      {r.state === "URGENT" && r.emergency && (
        <div role="alert" className="rounded-xl border-2 border-red-600 bg-red-50 p-4 text-red-950">
          <p className="text-lg font-bold">{r.emergency.headline}</p>
          <p className="mt-2">{r.emergency.body}</p>
          <p className="mt-2 font-semibold">{r.emergency.notice}</p>
          <p className="mt-1 text-xs">{r.emergency.status}</p>
        </div>
      )}
      {r.messages.map((m, i) => <Banner key={i} tone={r.state === "ROUTINE" ? "ok" : r.state === "URGENT" ? "danger" : "warn"}>{m}</Banner>)}
      {r.clinician_alert_recorded && <Banner tone="warn" title="Clinician alert recorded — status: not yet acknowledged">An alert is waiting for clinician review. It has not been seen by anyone yet, is not monitored 24/7, and nobody has been dispatched.</Banner>}
      <ul className="list-disc pl-5 text-sm text-muted">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      <p className="text-xs text-muted">Reference: rules {r.evaluation.triggered_rule_ids.join(", ") || "none triggered"} · module v{r.evaluation.module_version}</p>
      <Button variant="secondary" onClick={onAgain}>Start another check-in</Button>
    </div>
  );
}
