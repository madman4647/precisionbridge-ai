import { pageCtx, allow } from "@/lib/page";
import { viewAudit } from "@/services/admin";
import { AUDIT_ACTIONS } from "@/core/audit/types";
import { Card, Denied, Table, Button, inputCls } from "@/components/ui";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["safety_admin"], "/admin/audit"))) return <Denied />;
  const r = await viewAudit(ctx, { action: q.action || undefined, outcome: q.outcome || undefined, actor_id: q.actor || undefined, resource_id: q.resource || undefined, limit: 200 });
  if (!r.ok) return <Denied />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Audit log</h1>
      <Card>
        <form className="grid gap-3 sm:grid-cols-5" method="get">
          <label className="text-sm">Action<select name="action" defaultValue={q.action ?? ""} className={inputCls}><option value="">All</option>{AUDIT_ACTIONS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="text-sm">Outcome<select name="outcome" defaultValue={q.outcome ?? ""} className={inputCls}><option value="">All</option><option>success</option><option>denied</option><option>error</option></select></label>
          <label className="text-sm">Actor<input name="actor" defaultValue={q.actor ?? ""} className={inputCls} /></label>
          <label className="text-sm">Resource id<input name="resource" defaultValue={q.resource ?? ""} className={inputCls} /></label>
          <div className="flex items-end"><Button type="submit">Filter</Button></div>
        </form>
      </Card>
      <Card title={`${r.data.length} most recent events (newest first)`}>
        <Table head={["Time", "Action", "Outcome", "Actor", "Resource", "Module / rules", "Details"]}>
          {r.data.map((e) => (
            <tr key={e.id} className="align-top"><td className="px-2 py-1.5 text-xs">{e.ts.slice(0, 19).replace("T", " ")}</td><td className="px-2 py-1.5">{e.action}</td><td className="px-2 py-1.5"><span className={e.outcome === "success" ? "" : "font-bold text-red-800"}>{e.outcome}</span></td><td className="px-2 py-1.5">{e.actor_id}<span className="text-xs text-muted"> ({e.actor_role})</span></td><td className="px-2 py-1.5 text-xs">{e.resource_type} {e.resource_id}</td><td className="px-2 py-1.5 text-xs">{[e.module_id && `${e.module_id}@${e.module_version ?? "?"}`, e.rule_ids?.length ? `rules ${e.rule_ids.join(",")}` : ""].filter(Boolean).join(" · ")}</td><td className="max-w-xs break-words px-2 py-1.5 text-xs text-muted">{e.details ? JSON.stringify(e.details).slice(0, 160) : ""}</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
