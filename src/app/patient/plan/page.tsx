import { pageCtx, allow } from "@/lib/page";
import { getPatientDetail, getPatientPlan } from "@/services/patients";
import { Banner, Card, Denied } from "@/components/ui";
import { FollowUpForm } from "@/components/patient/FollowUpForm";

export default async function PlanPage() {
  const { ctx, user } = await pageCtx();
  if (!(await allow(ctx, ["patient"], "/patient/plan"))) return <Denied />;
  const pid = user!.patient_id!;
  const [d, r] = await Promise.all([getPatientDetail(ctx, pid), getPatientPlan(ctx, pid)]);
  if (!d.ok || !r.ok) return <Denied />;
  const { plan, followups } = r.data;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">My approved plan</h1>
      <Banner tone="info" title="Only clinician-signed plans appear here">Draft treatment comparisons and option rankings are never shown to patients.</Banner>
      {plan ? (
        <Card title={`Plan version ${plan.version}`} actions={<span className="text-xs text-muted">Signed {plan.signed_at.slice(0, 10)} by {plan.signed_by}</span>}>
          <ul className="list-disc space-y-2 pl-5 text-sm">{plan.items.map((i, k) => <li key={k}><span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold uppercase text-slate-700">{i.type.replace(/_/g, " ")}</span>{i.text}</li>)}</ul>
        </Card>
      ) : <Card><p className="text-sm text-muted">Your clinician has not signed a plan yet.</p></Card>}
      {plan && <Card title="Tell us how it's going"><FollowUpForm patientId={pid} planVersion={plan.version} /></Card>}
      {followups.length > 0 && <Card title="Your previous reports"><ul className="space-y-1 text-sm">{followups.map((f) => <li key={f.id}>{f.created_at.slice(0, 10)} · plan v{f.plan_version} · {f.response.replace(/_/g, " ")} · side effects: {f.side_effects.join(", ") || "none"} ({f.severity})</li>)}</ul></Card>}
    </div>
  );
}
