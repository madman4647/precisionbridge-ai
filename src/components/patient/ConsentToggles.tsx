"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function ConsentToggles({ patientId, initial }: { patientId: string; initial: { clinical: boolean; research: boolean } }) {
  const [c, setC] = useState(initial);
  const [msg, setMsg] = useState("");
  const router = useRouter();
  async function set(kind: "clinical" | "research", granted: boolean) {
    const r = await fetch(`/api/patients/${patientId}/consents`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, granted }) });
    const j = await r.json();
    if (r.ok) { setC(j.data); setMsg(`${kind} consent ${granted ? "granted" : "revoked"}. Revoking stops future processing.`); router.refresh(); } else setMsg(j.error ?? "failed");
  }
  const row = (kind: "clinical" | "research", title: string, text: string) => (
    <div className="flex flex-col gap-2 rounded-lg border border-line p-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h3 className="font-semibold">{title}</h3><p className="text-sm text-muted">{text}</p><p className="mt-1 text-sm font-medium" aria-live="polite">Status: {c[kind] ? "Granted" : "Not granted"}</p></div>
      <div className="flex gap-2">{c[kind] ? <Button variant="danger" onClick={() => set(kind, false)}>Revoke</Button> : <Button onClick={() => set(kind, true)}>Grant</Button>}</div>
    </div>
  );
  return (
    <div className="space-y-3">
      {row("clinical", "Clinical demo consent", "Allows your check-ins and profile to be reviewed by your assigned clinician in this demo.")}
      {row("research", "Research demo consent", "Allows de-identified, aggregated use of your synthetic outcomes in the research workbench. Separate from clinical consent. Revoking removes you from future queries.")}
      <p role="status" className="text-sm text-muted">{msg}</p>
    </div>
  );
}
