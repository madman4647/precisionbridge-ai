import { pageCtx, allow } from "@/lib/page";
import { computeKpis } from "@/services/metrics";
import { Badge, Banner, Card, Denied, Table } from "@/components/ui";

export default async function MetricsPage() {
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["safety_admin"], "/admin/metrics"))) return <Denied />;
  const r = await computeKpis(ctx);
  if (!r.ok) return <Denied />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">KPIs vs. proposed targets (PRD §13)</h1>
      <Banner tone="warn" title="Fixture-based, not real-world results">Values are computed live from labelled synthetic fixtures and the audit log. Targets are proposed acceptance criteria, not observed clinical performance. Items marked &ldquo;not measured&rdquo; need a separate test run or user study.</Banner>
      <Card>
        <Table head={["KPI", "Definition", "Target", "Current value", "Status", "Caveat / source"]}>
          {r.data.kpis.map((k) => (
            <tr key={k.id} className="align-top"><td className="px-2 py-2 font-semibold">{k.name}</td><td className="px-2 py-2 text-xs">{k.definition}</td><td className="px-2 py-2">{k.target}</td><td className="px-2 py-2">{k.value}</td><td className="px-2 py-2"><Badge tone={k.status === "pass" ? "green" : k.status === "fail" ? "red" : "slate"}>{k.status === "pass" ? "✓ Meets target" : k.status === "fail" ? "✗ Below target" : "Not measured here"}</Badge></td><td className="px-2 py-2 text-xs text-muted">{k.caveat}<br />Source: {k.source}</td></tr>
          ))}
        </Table>
      </Card>
      <p className="text-xs text-muted">Computed {r.data.generated_at}. Entities: {JSON.stringify(r.data.counts)}.</p>
    </div>
  );
}
