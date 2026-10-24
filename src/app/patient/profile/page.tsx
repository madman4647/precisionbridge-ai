import { pageCtx, allow } from "@/lib/page";
import { getPatientDetail } from "@/services/patients";
import { Badge, Card, Denied, Table } from "@/components/ui";
import { ProfileEditor } from "@/components/patient/ProfileEditor";
import type { Datum } from "@/core/types";

export default async function ProfilePage() {
  const { ctx, user } = await pageCtx();
  if (!(await allow(ctx, ["patient"], "/patient/profile"))) return <Denied />;
  const d = await getPatientDetail(ctx, user!.patient_id!);
  if (!d.ok) return <Denied />;
  const p = d.data;
  const rows = Object.entries(p.profile.fields) as [string, Datum][];
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Your profile</h1>
      <Card title={`Completeness: ${p.completeness.percent}%`}>
        <ul className="grid gap-1 text-sm sm:grid-cols-2">{p.completeness.items.map((i) => <li key={i.key} className="flex items-center justify-between rounded border border-line px-2 py-1"><span>{i.label}</span><Badge tone={i.status === "complete" ? "green" : i.status === "unverified" ? "amber" : "red"}>{i.status}</Badge></li>)}</ul>
      </Card>
      <Card title="Data and provenance">
        <Table head={["Item", "Value", "Source", "Verification", "Note"]} caption="Every item shows who provided it and whether it has been verified. Unknown stays unknown.">
          {rows.map(([k, v]) => (
            <tr key={k}><td className="px-2 py-2 font-medium">{k.replace(/_/g, " ")}</td><td className="px-2 py-2">{v.value === null ? <em>not recorded</em> : String(v.value)}{v.unit ? ` ${v.unit}` : ""}</td><td className="px-2 py-2">{v.source}</td><td className="px-2 py-2"><Badge tone={v.verification_status === "verified" ? "green" : "amber"}>{v.verification_status}</Badge></td><td className="px-2 py-2 text-muted">{v.null_reason ? v.null_reason.replace(/_/g, " ") : ""}</td></tr>
          ))}
        </Table>
      </Card>
      <Card title="Edit what you know">
        <ProfileEditor patientId={p.id} allergyStatus={p.profile.allergy_status} allergies={p.profile.allergies.map((a) => ({ substance: a.substance, class_tag: a.class_tag, reaction: a.reaction }))} preferences={p.profile.preferences} />
      </Card>
    </div>
  );
}
