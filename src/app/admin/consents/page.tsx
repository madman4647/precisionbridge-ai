import { pageCtx, allow } from "@/lib/page";
import { consentAudit } from "@/services/admin";
import { Badge, Banner, Card, Denied, Table } from "@/components/ui";

export default async function ConsentAuditPage() {
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["safety_admin"], "/admin/consents"))) return <Denied />;
  const r = await consentAudit(ctx);
  if (!r.ok) return <Denied />;
  const c = r.data;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Consent audit</h1>
      <Banner tone="info">Counts only — pseudonymous references, no health details. Consent changes are individually audited.</Banner>
      <div className="grid gap-3 sm:grid-cols-4">{[["Patients", c.patients], ["Clinical consent on", c.clinical_on], ["Research consent on", c.research_on], ["Research consent off", c.research_off]].map(([l, v]) => <Card key={String(l)}><p className="text-sm text-muted">{l}</p><p className="text-3xl font-bold">{v}</p></Card>)}</div>
      <Card title="Consent changes made in this session (most recent first)">
        {c.recent_changes.length === 0 ? <p className="text-sm text-muted">No live changes yet — toggle a consent in the patient app.</p> :
          <Table head={["Time", "Patient ref", "Kind", "Result"]}>{c.recent_changes.map((x) => <tr key={x.id}><td className="px-2 py-1.5 text-xs">{x.at.slice(0, 19).replace("T", " ")}</td><td className="px-2 py-1.5">{x.patient_ref}</td><td className="px-2 py-1.5">{x.kind}</td><td className="px-2 py-1.5"><Badge tone={x.granted ? "green" : "red"}>{x.granted ? "granted" : "revoked"}</Badge></td></tr>)}</Table>}
      </Card>
    </div>
  );
}
