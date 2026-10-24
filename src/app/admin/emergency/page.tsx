import { pageCtx, allow } from "@/lib/page";
import { emergencyCopy } from "@/services/admin";
import { Banner, Card, Denied } from "@/components/ui";

export default async function EmergencyPage() {
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["safety_admin"], "/admin/emergency"))) return <Denied />;
  const r = await emergencyCopy(ctx);
  if (!r.ok) return <Denied />;
  const e = r.data;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Emergency copy (view only)</h1>
      <Banner tone="info">{e.note}</Banner>
      <Card title={`Immediate help guidance — ${e.emergency.version}`}><p className="font-semibold">{e.emergency.headline}</p><p className="mt-2">{e.emergency.body}</p><p className="mt-2 font-semibold">{e.emergency.notice}</p><p className="mt-1 text-xs text-muted">{e.emergency.jurisdiction} · {e.emergency.status}</p></Card>
      <Card title="Default patient messages"><dl className="space-y-2 text-sm">{Object.entries(e.defaults).map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>)}</dl></Card>
      {e.per_module.map((m) => <Card key={m.module_id} title={`${m.module_id} v${m.version} — module messages`}><dl className="space-y-2 text-sm">{Object.entries(m.messages).map(([k, v]) => <div key={k}><dt className="font-semibold">{k}</dt><dd className="text-muted">{v}</dd></div>)}</dl></Card>)}
    </div>
  );
}
