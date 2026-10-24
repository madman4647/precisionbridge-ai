"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DEMO_USERS } from "@/lib/demoUsers";

const HOME: Record<string, string> = { patient: "/patient", clinician: "/clinician", researcher: "/research", safety_admin: "/admin" };

export function RoleSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [val, setVal] = useState(current);
  useEffect(() => setVal(current), [current]);
  async function change(id: string) {
    setBusy(true); setVal(id);
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user_id: id }) });
    setBusy(false);
    if (res.ok) { const u = DEMO_USERS.find((x) => x.id === id)!; router.push(HOME[u.role]); router.refresh(); }
  }
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="role-switch" className="text-sm font-medium">Demo role:</label>
      <select id="role-switch" value={val} disabled={busy} onChange={(e) => change(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm">
        {!current && <option value="">Choose a demo user…</option>}
        {DEMO_USERS.map((u) => <option key={u.id} value={u.id}>{u.display_name} — {u.role.replace("_", " ")}</option>)}
      </select>
    </div>
  );
}
