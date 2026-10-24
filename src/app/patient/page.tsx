import Link from "next/link";
import { pageCtx, allow } from "@/lib/page";
import { getPatientDetail, getPatientPlan } from "@/services/patients";
import { Banner, Card, Denied, Badge } from "@/components/ui";
import { ClipboardCheck, FileText, ShieldCheck, UserRound } from "lucide-react";

export default async function PatientHome() {
  const { ctx, user } = await pageCtx();
  if (!(await allow(ctx, ["patient"], "/patient"))) return <Denied what="The patient app is for patient users." />;
  const pid = user!.patient_id!;
  const d = await getPatientDetail(ctx, pid);
  const plan = await getPatientPlan(ctx, pid);
  if (!d.ok || !plan.ok) return <Denied />;
  const p = d.data;
  return (
    <div className="space-y-5">
      <div><h1 className="text-2xl font-bold">Hello, {p.display_name}</h1><p className="text-muted">Patient app · {p.module_id === "t2d" ? "Type 2 diabetes" : p.module_id === "hypertension" ? "Hypertension" : "Depression"} · demo only</p></div>
      <Banner tone="warn" title="This demo is not monitored 24/7">If you feel unsafe or very unwell, call your local emergency number. Check-ins are snapshots, not continuous monitoring.</Banner>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><ShieldCheck size={18} aria-hidden /> Consents</span>}>
          <ul className="space-y-1 text-sm"><li>Clinical use: <Badge tone={p.consent.clinical ? "green" : "red"}>{p.consent.clinical ? "Granted" : "Not granted"}</Badge></li><li>Research use (de-identified): <Badge tone={p.consent.research ? "green" : "slate"}>{p.consent.research ? "Granted" : "Not granted"}</Badge></li></ul>
          <Link className="mt-3 inline-block text-sm font-semibold text-brand-dark underline" href="/patient/consent">Manage consents</Link>
        </Card>
        <Card title={<span className="flex items-center gap-2"><UserRound size={18} aria-hidden /> Profile completeness</span>}>
          <p className="text-3xl font-bold">{p.completeness.percent}%</p>
          <p className="text-sm text-muted">Missing or unverified items are shown as such — never assumed normal.</p>
          <Link className="mt-3 inline-block text-sm font-semibold text-brand-dark underline" href="/patient/profile">Review profile</Link>
        </Card>
        <Card title={<span className="flex items-center gap-2"><ClipboardCheck size={18} aria-hidden /> Check-in</span>}>
          <p className="text-sm">A short questionnaire (about 1–2 minutes). Urgent answers get help guidance straight away.</p>
          <Link className="mt-3 inline-block text-sm font-semibold text-brand-dark underline" href="/patient/checkin">Start a check-in</Link>
        </Card>
        <Card title={<span className="flex items-center gap-2"><FileText size={18} aria-hidden /> My approved plan</span>}>
          {plan.data.plan ? <p className="text-sm">Version {plan.data.plan.version}, signed {plan.data.plan.signed_at.slice(0, 10)}.</p> : <p className="text-sm text-muted">No signed plan yet.</p>}
          <Link className="mt-3 inline-block text-sm font-semibold text-brand-dark underline" href="/patient/plan">View plan</Link>
        </Card>
      </div>
    </div>
  );
}
