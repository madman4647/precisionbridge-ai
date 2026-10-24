"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Banner, Button, Card, Table, inputCls } from "@/components/ui";

interface Mod { id: string; module_id: string; version: string; status: string; display_name: string; condition_code: string; last_evidence_review: string; clinical_approver: { name: string; illustrative_placeholder: boolean }; rules: number; options: number; questions: number; warnings: string[] }
interface Val { ok: boolean; errors: string[]; warnings: string[]; summary: { rules: number; options: number; questions: number } | null }

export function AdminConsole({ modules, fault, samples }: { modules: Mod[]; fault: boolean; samples: Record<string, unknown> }) {
  const router = useRouter();
  const [text, setText] = useState(JSON.stringify(Object.values(samples)[0], null, 2));
  const [val, setVal] = useState<Val | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "info"; text: string } | null>(null);
  const [faultOn, setFaultOn] = useState(fault);
  const [busy, setBusy] = useState(false);

  async function post(url: string, body?: unknown) {
    setBusy(true);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    return { ok: r.ok, j };
  }
  function parse(): unknown | null { try { return JSON.parse(text); } catch { setMsg({ tone: "danger", text: "Not valid JSON" }); return null; } }
  async function validate() { const b = parse(); if (b === null) return; const { ok, j } = await post("/api/admin/modules/validate", b); if (ok) { setVal(j.data); setMsg(null); } else setMsg({ tone: "danger", text: j.error }); }
  async function register() { const b = parse(); if (b === null) return; const { ok, j } = await post("/api/admin/modules", b); if (ok) { setMsg({ tone: "ok", text: `Activated ${j.data.module_id} v${j.data.version}. No code was changed.` }); router.refresh(); } else { setMsg({ tone: "danger", text: `${j.error}${j.detail?.errors ? ": " + j.detail.errors.slice(0, 4).join("; ") : ""}` }); } }
  async function act(m: Mod, kind: "activate" | "rollback") { const { ok, j } = await post(`/api/admin/modules/${m.module_id}/${kind}`, kind === "activate" ? { version: m.version } : undefined); setMsg(ok ? { tone: "ok", text: `${kind} succeeded for ${m.module_id}` } : { tone: "danger", text: j.error }); if (ok) router.refresh(); }
  async function toggleFault() { const { ok, j } = await post("/api/admin/fault-injection", { safety_timeout: !faultOn }); if (ok) { setFaultOn(j.data.safety_timeout); setMsg({ tone: "info", text: j.data.safety_timeout ? "Fault injection ON: the safety service will time out, so new check-ins return UNABLE_TO_ASSESS (fail closed)." : "Fault injection OFF." }); } }
  async function reset() { if (!confirm("Reset ALL demo data to the deterministic seed? This clears check-ins, decisions, consents changes and the audit log.")) return; const { ok, j } = await post("/api/admin/reset"); setMsg(ok ? { tone: "ok", text: `Reseeded ${j.data.patients} patients / ${j.data.checkins} check-ins.` } : { tone: "danger", text: j.error }); if (ok) router.refresh(); }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Admin console — disease modules</h1>
      {msg && <Banner tone={msg.tone}><span role="status">{msg.text}</span></Banner>}
      <Card title="Module versions">
        <Table head={["Module", "Version", "Status", "Content", "Approver", "Evidence reviewed", "Actions"]}>
          {modules.map((m) => (
            <tr key={m.id} className="align-top"><td className="px-2 py-2 font-semibold">{m.display_name} <span className="text-xs text-muted">({m.module_id})</span></td><td className="px-2 py-2">{m.version}</td>
              <td className="px-2 py-2"><Badge tone={m.status === "active" ? "green" : m.status === "draft" ? "amber" : "slate"}>{m.status}</Badge></td>
              <td className="px-2 py-2 text-xs">{m.questions} questions · {m.rules} rules · {m.options} option cards</td>
              <td className="px-2 py-2 text-xs">{m.clinical_approver.name}{m.clinical_approver.illustrative_placeholder && <><br /><Badge tone="amber">Illustrative placeholder</Badge></>}</td>
              <td className="px-2 py-2 text-xs">{m.last_evidence_review}</td>
              <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{m.status !== "active" && <Button variant="secondary" disabled={busy} onClick={() => act(m, "activate")}>Activate</Button>}{m.status === "active" && <Button variant="secondary" disabled={busy} onClick={() => act(m, "rollback")}>Roll back</Button>}</div></td></tr>
          ))}
        </Table>
        <p className="mt-2 text-xs text-muted">Approved versions are immutable. A rejected module can never be activated; rollback re-activates the previous version.</p>
      </Card>
      <Card title="Validate / load a module manifest (portability demo)">
        <div className="mb-2 flex flex-wrap gap-2">{Object.entries(samples).map(([k, v]) => <Button key={k} variant="ghost" onClick={() => { setText(JSON.stringify(v, null, 2)); setVal(null); }}>{k}</Button>)}</div>
        <label htmlFor="manifest" className="text-sm font-medium">Manifest JSON</label>
        <textarea id="manifest" rows={14} className={`${inputCls} font-mono text-xs`} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="mt-2 flex gap-2"><Button onClick={validate} disabled={busy}>Validate</Button><Button variant="secondary" onClick={register} disabled={busy}>Validate + activate</Button></div>
        {val && (
          <div className="mt-3 space-y-2">
            <Banner tone={val.ok ? "ok" : "danger"} title={val.ok ? "Valid — can be activated" : "Rejected — cannot be activated"}>{val.summary && <p>{val.summary.questions} questions, {val.summary.rules} red-flag rules, {val.summary.options} option cards.</p>}</Banner>
            {val.errors.length > 0 && <ul className="list-disc pl-5 text-sm text-red-900">{val.errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}</ul>}
            {val.warnings.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{val.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>}
          </div>
        )}
      </Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Fail-closed drill (T15)">
          <p className="mb-2 text-sm">Injects a safety-service timeout. While on, any new check-in must return UNABLE_TO_ASSESS with no routine reassurance and no option comparison.</p>
          <Button variant={faultOn ? "danger" : "secondary"} onClick={toggleFault} disabled={busy}>{faultOn ? "Turn fault injection OFF" : "Turn fault injection ON"}</Button>
        </Card>
        <Card title="Reset demo data">
          <p className="mb-2 text-sm">Truncates all tables and deterministically reseeds 300 synthetic patients so the storyboard can be restarted.</p>
          <Button variant="danger" onClick={reset} disabled={busy}>Reset demo data</Button>
        </Card>
      </div>
    </div>
  );
}
