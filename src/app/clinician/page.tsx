import Link from "next/link";
import { pageCtx, allow } from "@/lib/page";
import { getCaseload } from "@/services/patients";
import { Banner, Card, Denied, StateBadge, Table } from "@/components/ui";

const LABEL = { urgent: "Urgent — open alerts", prompt_review: "Prompt review", pending: "Pending follow-up", stable: "Storyboard fixtures (no open alert)" } as const;

export default async function Caseload() {
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["clinician"], "/clinician"))) return <Denied what="The clinician cockpit is for clinician users." />;
  const r = await getCaseload(ctx);
  if (!r.ok) return <Denied />;
  const groups = (["urgent", "prompt_review", "pending", "stable"] as const).map((k) => ({ k, rows: r.data.filter((x) => x.category === k) }));
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Caseload queue</h1>
      <Banner tone="info" title="Sorted: urgent → prompt review → pending">Urgent alerts persist until a clinician records a disposition. Nothing here changes a patient&apos;s medication — only a signed decision does.</Banner>
      {groups.map(({ k, rows }) => (
        <Card key={k} title={`${LABEL[k]} (${rows.length})`}>
          {rows.length === 0 ? <p className="text-sm text-muted">None.</p> : (
            <Table head={["Patient", "Module", "Latest state", "Why", "Last check-in"]}>
              {rows.map((x) => (
                <tr key={x.patient_id}>
                  <td className="px-2 py-2"><Link className="font-semibold text-brand-dark underline" href={`/clinician/patients/${x.patient_id}`}>{x.patient_id}</Link></td>
                  <td className="px-2 py-2">{x.condition_code}</td>
                  <td className="px-2 py-2"><StateBadge state={x.latest_state} /></td>
                  <td className="px-2 py-2 text-muted">{x.reasons.join("; ") || "—"}</td>
                  <td className="px-2 py-2 text-muted">{x.last_checkin_at?.slice(0, 16).replace("T", " ") ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      ))}
    </div>
  );
}
