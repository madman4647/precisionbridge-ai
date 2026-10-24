"use client";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Pt { at: string; checkin_id: string; value: number | null; missing: boolean; suspect: boolean }
interface Series { concept: string; label: string; unit: string; points: Pt[] }
interface Ev { at: string; label: string; kind: "start" | "stop" | "plan" }

const STATE_LABEL: Record<string, string> = { URGENT: "URGENT", PROMPT_REVIEW: "PROMPT", ROUTINE: "ROUTINE", UNABLE_TO_ASSESS: "UNABLE" };

export function TimelineChart({ series, events, rows, conflicts }: { series: Series[]; events: Ev[]; rows: { checkin_id: string; at: string; state: string | null; triggered: string[]; missing: string[] }[]; conflicts: { checkin_id: string; concept: string; reason: string }[] }) {
  const t = (s: string) => new Date(s.length === 10 ? `${s}T00:00:00Z` : s).getTime();
  const lo = rows.length ? t(rows[0].at) : 0, hi = rows.length ? t(rows[rows.length - 1].at) : 0;
  const inRange = events.filter((e) => t(e.at) >= lo - 14 * 864e5 && t(e.at) <= hi + 864e5);
  const fmt = (v: number) => new Date(v).toISOString().slice(5, 10);
  return (
    <div className="space-y-4">
      {series.length === 0 && <p className="text-sm text-muted">No numeric observations yet.</p>}
      {series.map((s) => {
        const data = s.points.map((p) => ({ x: t(p.at), y: p.value }));
        return (
          <figure key={s.concept} aria-label={`${s.label} trend`}>
            <figcaption className="mb-1 text-sm font-medium">{s.label}{s.unit ? ` (${s.unit})` : ""}</figcaption>
            <div className="h-44 w-full">
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d5dde8" />
                  <XAxis dataKey="x" type="number" scale="time" domain={[lo - 864e5, Math.max(hi, ...inRange.map((e) => t(e.at))) + 864e5]} tickFormatter={fmt} tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} width={38} />
                  <Tooltip labelFormatter={(v) => new Date(Number(v)).toISOString().slice(0, 16).replace("T", " ")} />
                  {inRange.map((e, i) => <ReferenceLine key={i} x={t(e.at)} stroke={e.kind === "stop" ? "#b91c1c" : e.kind === "plan" ? "#0b6e75" : "#7c3aed"} strokeDasharray="4 3" label={{ value: e.kind === "plan" ? "Plan" : e.kind === "stop" ? "Stop" : "Start", fontSize: 10, position: "top" }} />)}
                  <Line type="monotone" dataKey="y" stroke="#0b6e75" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-muted">Gaps = missing or suspect values (excluded from the trend). Dashed lines: medication start/stop (purple/red) and signed plans (teal).</p>
          </figure>
        );
      })}
      {conflicts.length > 0 && <div role="note" className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950"><p className="font-semibold">Data-quality conflicts — suspect values excluded until resolved</p><ul className="list-disc pl-5">{conflicts.map((c, i) => <li key={i}>{c.concept} in {c.checkin_id}: {c.reason}</li>)}</ul></div>}
      <details className="text-sm"><summary className="font-medium">Data table (accessible alternative)</summary>
        <div className="overflow-x-auto"><table className="mt-2 w-full text-left text-xs"><thead><tr><th className="p-1">Check-in</th><th className="p-1">State</th><th className="p-1">Rules</th><th className="p-1">Missing answers</th>{series.map((s) => <th key={s.concept} className="p-1">{s.label}</th>)}</tr></thead>
          <tbody>{rows.map((r) => <tr key={r.checkin_id} className="border-t border-line"><td className="p-1">{r.at.slice(0, 10)}</td><td className="p-1">{r.state ? STATE_LABEL[r.state] : "—"}</td><td className="p-1">{r.triggered.join(", ") || "—"}</td><td className="p-1">{r.missing.join(", ") || "—"}</td>{series.map((s) => { const p = s.points.find((x) => x.checkin_id === r.checkin_id); return <td key={s.concept} className="p-1">{p?.value ?? (p?.suspect ? "suspect" : "missing")}</td>; })}</tr>)}</tbody></table></div>
      </details>
      <ul className="flex flex-wrap gap-1 text-xs">{inRange.map((e, i) => <li key={i} className="rounded bg-slate-100 px-1.5 py-0.5">{e.at.slice(0, 10)} · {e.label}</li>)}</ul>
    </div>
  );
}
