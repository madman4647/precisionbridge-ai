import { pageCtx, allow } from "@/lib/page";
import { getPatientDetail } from "@/services/patients";
import { Card, Denied } from "@/components/ui";
import { ConsentToggles } from "@/components/patient/ConsentToggles";

export default async function ConsentPage() {
  const { ctx, user } = await pageCtx();
  if (!(await allow(ctx, ["patient"], "/patient/consent"))) return <Denied />;
  const d = await getPatientDetail(ctx, user!.patient_id!);
  if (!d.ok) return <Denied />;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Consent and purpose</h1>
      <Card><ConsentToggles patientId={d.data.id} initial={d.data.consent} /></Card>
    </div>
  );
}
