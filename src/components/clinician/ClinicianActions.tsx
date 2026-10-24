"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, FilePlus2 } from "lucide-react";
import { Banner, Button, Card, Field, inputCls } from "@/components/ui";

interface CardLite { option_id: string; label: string; status: string }
interface Props { patientId: string; comparison: { id: string; cards: CardLite[] } | null; openAlerts: { id: string; state: string }[]; gateBlocked: boolean }

const ACTIONS = [
  ["approve_plan", "Approve plan (selected options)"], ["request_more_data", "Request more data"], ["reject_candidate", "Reject candidate option(s)"],
  ["record_alternative", "Record alternative"], ["mark_alert_reviewed", "Mark alert reviewed"], ["refer_to_human_service", "Refer to human service"],
] as const;

export function ClinicianActions({ patientId, comparison, openAlerts, gateBlocked }: Props) {
  const router = useRouter();
  const [action, setAction] = useState<string>(openAlerts.length && !comparison ? "mark_alert_reviewed" : "request_more_data");
  const [rationale, setRationale] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const [altLabel, setAltLabel] = useState("");
  const [alertId, setAlertId] = useState(openAlerts[0]?.id ?? "");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<string[]>(comparison?.cards.map((c) => c.option_id) ?? []);
  const [orderWhy, setOrderWhy] = useState("");

  async function post(url: string, body: unknown) {
    setBusy(true); setMsg(null);
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); setBusy(false);
    return { ok: r.ok, j };
  }
  async function sign(e: React.FormEvent) {
    e.preventDefault();
    const url = comparison ? `/api/comparisons/${comparison.id}/decisions` : `/api/patients/${patientId}/decisions`;
    const { ok, j } = await post(url, { action, rationale, selected_option_ids: selected, patient_instruction: instruction || undefined, alternative_label: altLabel || undefined, alert_id: ["mark_alert_reviewed"].includes(action) || openAlerts.length ? alertId || undefined : undefined });
    if (ok) { setMsg({ tone: "ok", text: `Signed. ${j.data.plan ? `New plan version v${j.data.plan.version} created (prior versions untouched).` : "Decision recorded."}` }); setRationale(""); setSelected([]); router.refresh(); }
    else setMsg({ tone: "danger", text: j.error ?? "Could not sign" });
  }
  async function regenerate() {
    const { ok, j } = await post(`/api/patients/${patientId}/comparisons`, {});
    if (ok) { setMsg({ tone: "ok", text: "Draft comparison generated." }); router.refresh(); } else setMsg({ tone: "danger", text: j.error ?? "Blocked" });
  }
  async function saveOrder() {
    if (!comparison) return;
    const { ok, j } = await post(`/api/comparisons/${comparison.id}/decisions`, { action: "reorder_options", rationale: orderWhy, option_order: order });
    if (ok) { setMsg({ tone: "ok", text: "Order saved as a signed decision with rationale." }); router.refresh(); } else setMsg({ tone: "danger", text: j.error ?? "Could not save order" });
  }
  const move = (i: number, d: number) => { const o = [...order]; const k = i + d; if (k < 0 || k >= o.length) return; [o[i], o[k]] = [o[k], o[i]]; setOrder(o); };
  const label = (id: string) => comparison?.cards.find((c) => c.option_id === id)?.label ?? id;
  const needsOptions = action === "approve_plan" || action === "reject_candidate";

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card title="Decision composer (signs as you)" className="lg:col-span-2">
        <form onSubmit={sign} className="space-y-3">
          <Banner tone="info">Medication-related plan items are created only here, after your sign-off. Signed records are never edited — changes create a new version with signer, time and reason.</Banner>
          <Field label="Action" htmlFor="act"><select id="act" className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          {needsOptions && (
            <fieldset className="space-y-1"><legend className="text-sm font-medium">Options</legend>
              {!comparison && <p className="text-sm text-muted">No comparison available.</p>}
              {comparison?.cards.map((c) => (
                <label key={c.option_id} className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={c.status === "excluded_by_rule"} checked={selected.includes(c.option_id)} onChange={(e) => setSelected(e.target.checked ? [...selected, c.option_id] : selected.filter((x) => x !== c.option_id))} /> {c.label} <span className="text-xs text-muted">({c.status.replace(/_/g, " ")})</span></label>
              ))}
            </fieldset>
          )}
          {action === "record_alternative" && <Field label="Alternative (class or approach)" htmlFor="alt"><input id="alt" className={inputCls} value={altLabel} onChange={(e) => setAltLabel(e.target.value)} /></Field>}
          {["request_more_data", "record_alternative", "refer_to_human_service", "approve_plan"].includes(action) && (
            <Field label={action === "request_more_data" ? "What should the patient do / provide? (shown to patient)" : "Patient-facing instruction (shown to patient; the system generates no doses)"} htmlFor="instr"><input id="instr" className={inputCls} value={instruction} onChange={(e) => setInstruction(e.target.value)} /></Field>
          )}
          {openAlerts.length > 0 && <Field label="Link to open alert (acknowledges it)" htmlFor="al"><select id="al" className={inputCls} value={alertId} onChange={(e) => setAlertId(e.target.value)}><option value="">— none —</option>{openAlerts.map((a) => <option key={a.id} value={a.id}>{a.state} · {a.id}</option>)}</select></Field>}
          <Field label="Rationale (required, min. 10 characters)" htmlFor="why"><textarea id="why" rows={3} className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} /></Field>
          <div className="flex flex-wrap items-center gap-2"><Button type="submit" disabled={busy}>Sign decision</Button><Button type="button" variant="secondary" onClick={regenerate} disabled={busy || gateBlocked}><FilePlus2 size={14} aria-hidden /> {gateBlocked ? "Comparison blocked by safety gate" : "Generate / refresh draft comparison"}</Button></div>
          {msg && <Banner tone={msg.tone}>{msg.text}</Banner>}
        </form>
      </Card>
      <Card title="Reorder options (rationale mandatory)">
        {!comparison ? <p className="text-sm text-muted">No comparison to reorder.</p> : (
          <div className="space-y-2">
            <ol className="space-y-1 text-sm">{order.map((id, i) => <li key={id} className="flex items-center justify-between rounded border border-line px-2 py-1"><span>{i + 1}. {label(id)}</span><span className="flex gap-1"><button type="button" aria-label={`Move ${label(id)} up`} className="rounded border border-line p-1" onClick={() => move(i, -1)}><ArrowUp size={12} aria-hidden /></button><button type="button" aria-label={`Move ${label(id)} down`} className="rounded border border-line p-1" onClick={() => move(i, 1)}><ArrowDown size={12} aria-hidden /></button></span></li>)}</ol>
            <Field label="Rationale for new order" htmlFor="ord-why"><input id="ord-why" className={inputCls} value={orderWhy} onChange={(e) => setOrderWhy(e.target.value)} /></Field>
            <Button type="button" variant="secondary" disabled={busy} onClick={saveOrder}>Save order</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
