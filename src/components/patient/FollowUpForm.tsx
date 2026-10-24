"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, inputCls } from "@/components/ui";

export function FollowUpForm({ patientId, planVersion }: { patientId: string; planVersion: number }) {
  const [response, setResponse] = useState("same");
  const [severity, setSeverity] = useState("none");
  const [effects, setEffects] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();
  async function submit() {
    const r = await fetch(`/api/patients/${patientId}/followups`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan_version: planVersion, response, severity, side_effects: effects.split(",").map((s) => s.trim()).filter(Boolean), note }) });
    const j = await r.json();
    setMsg(r.ok ? j.data.note : j.error ?? "failed");
    if (r.ok) router.refresh();
  }
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <p className="text-sm text-muted sm:col-span-2">This report is linked to plan version {planVersion}.</p>
      <Field label="How are you getting on?" htmlFor="fu-resp"><select id="fu-resp" className={inputCls} value={response} onChange={(e) => setResponse(e.target.value)}><option value="better">Better</option><option value="same">About the same</option><option value="worse">Worse</option><option value="not_started">I haven&apos;t started yet</option></select></Field>
      <Field label="Side-effect severity" htmlFor="fu-sev"><select id="fu-sev" className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value)}><option value="none">None</option><option value="mild">Mild</option><option value="moderate">Moderate</option><option value="severe">Severe</option></select></Field>
      <Field label="Side effects (comma separated)" htmlFor="fu-eff"><input id="fu-eff" className={inputCls} value={effects} onChange={(e) => setEffects(e.target.value)} /></Field>
      <Field label="Anything else?" htmlFor="fu-note"><input id="fu-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <div className="sm:col-span-2"><Button type="submit">Send report</Button><p role="status" className="mt-2 text-sm text-muted">{msg}</p></div>
    </form>
  );
}
