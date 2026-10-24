import { pageCtx, allow } from "@/lib/page";
import { getPatientDetail } from "@/services/patients";
import { getActiveManifest } from "@/db/repo";
import { Banner, Card, Denied } from "@/components/ui";
import { CheckInForm } from "@/components/patient/CheckInForm";

export default async function CheckInPage() {
  const { ctx, user } = await pageCtx();
  if (!(await allow(ctx, ["patient"], "/patient/checkin"))) return <Denied />;
  const d = await getPatientDetail(ctx, user!.patient_id!);
  if (!d.ok) return <Denied />;
  const m = await getActiveManifest(ctx.db, d.data.module_id);
  if (!m) return <Banner tone="danger" title="No active module">This condition has no active module, so check-ins are unavailable.</Banner>;
  if (!d.data.consent.clinical) return <Banner tone="warn" title="Clinical consent needed">Please grant clinical consent on the Consent page before checking in.</Banner>;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{m.display_name} check-in</h1>
      <Card><CheckInForm patientId={d.data.id} questions={m.checkin_question_schema.map((q) => ({ id: q.id, text: q.text, type: q.type, unit: q.unit, allowed_units: q.allowed_units, choices: q.choices, min: q.min, max: q.max, required: q.required, safety_critical: q.safety_critical }))} /></Card>
    </div>
  );
}
