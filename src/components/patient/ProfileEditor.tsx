"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, inputCls } from "@/components/ui";

const PREFS = [["avoid_hypoglycemia", "Avoid low blood sugar"], ["avoid_injections", "Avoid injections"], ["avoid_medication", "Prefer to minimise medication"], ["avoid_sexual_side_effects", "Avoid sexual side effects"]];

export function ProfileEditor({ patientId, allergyStatus, allergies, preferences }: { patientId: string; allergyStatus: string; allergies: { substance: string; class_tag: string; reaction: string }[]; preferences: string[] }) {
  const [status, setStatus] = useState(allergyStatus);
  const [list, setList] = useState(allergies);
  const [prefs, setPrefs] = useState(preferences);
  const [sub, setSub] = useState(""), [cls, setCls] = useState(""), [rx, setRx] = useState("");
  const [msg, setMsg] = useState("");
  const router = useRouter();
  async function save() {
    const r = await fetch(`/api/patients/${patientId}/profile`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ allergy_status: status, allergies: status === "listed" ? list : [], preferences: prefs }) });
    const j = await r.json();
    setMsg(r.ok ? "Saved. Your entries are marked as patient-reported and unverified until a clinician confirms them." : j.error ?? "Could not save");
    if (r.ok) router.refresh();
  }
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <Field label="Allergies" htmlFor="allergy-status" hint="Choose 'I don't know' if unsure — we will not assume none.">
        <select id="allergy-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="unknown">I don&apos;t know</option><option value="none_known">No known allergies</option><option value="listed">I have allergies</option>
        </select>
      </Field>
      {status === "listed" && (
        <fieldset className="space-y-2 rounded-lg border border-line p-3"><legend className="px-1 text-sm font-medium">Listed allergies</legend>
          <ul className="text-sm">{list.map((a, i) => <li key={i} className="flex items-center justify-between"><span>{a.substance} ({a.class_tag}) — {a.reaction}</span><Button type="button" variant="ghost" onClick={() => setList(list.filter((_, k) => k !== i))}>Remove</Button></li>)}</ul>
          <div className="grid gap-2 sm:grid-cols-4">
            <input aria-label="Substance" className={inputCls} placeholder="Substance" value={sub} onChange={(e) => setSub(e.target.value)} />
            <input aria-label="Drug class tag" className={inputCls} placeholder="Class (e.g. ssri)" value={cls} onChange={(e) => setCls(e.target.value)} />
            <input aria-label="Reaction" className={inputCls} placeholder="Reaction" value={rx} onChange={(e) => setRx(e.target.value)} />
            <Button type="button" variant="secondary" disabled={!sub || !cls} onClick={() => { setList([...list, { substance: sub, class_tag: cls, reaction: rx }]); setSub(""); setCls(""); setRx(""); }}>Add</Button>
          </div>
        </fieldset>
      )}
      <fieldset className="space-y-1"><legend className="text-sm font-medium">Preferences (optional)</legend>
        {PREFS.map(([v, l]) => <label key={v} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={prefs.includes(v)} onChange={(e) => setPrefs(e.target.checked ? [...prefs, v] : prefs.filter((p) => p !== v))} /> {l}</label>)}
      </fieldset>
      <Button type="submit">Save profile</Button>
      <p role="status" className="text-sm text-muted">{msg}</p>
    </form>
  );
}
