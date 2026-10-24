import { pageCtx, allow } from "@/lib/page";
import { getPatientDetail, getTimeline } from "@/services/patients";
import { getPatientComparisons } from "@/services/comparisons";
import { listAuditByResources } from "@/db/repo";
import { Badge, Banner, Card, Denied, IllustrativeBadge, StateBadge, Table } from "@/components/ui";
import { TimelineChart } from "@/components/clinician/TimelineChart";
import { OptionCards } from "@/components/clinician/OptionCards";
import { ClinicianActions } from "@/components/clinician/ClinicianActions";
import type { Datum } from "@/core/types";
import { Download } from "lucide-react";

export default async function PatientCockpit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["clinician"], `/clinician/patients/${id}`))) return <Denied />;
  const d = await getPatientDetail(ctx, id);
  if (!d.ok) return <Denied what="This patient is not in your caseload, or does not exist." />;
  const [tl, cmpR] = await Promise.all([getTimeline(ctx, id), getPatientComparisons(ctx, id)]);
  if (!tl.ok || !cmpR.ok) return <Denied />;
  const p = d.data, t = tl.data, c = cmpR.data;
  const latest = t.rows[t.rows.length - 1];
  const comp = c.comparisons[0] ?? null;
  const entityIds = [id, ...t.rows.map((r) => r.checkin_id), ...t.rows.map((r) => `re_${r.checkin_id}`), ...t.alerts.map((a) => a.id), ...t.decisions.map((x) => x.id), ...t.plans.map((x) => x.id), ...c.comparisons.map((x) => x.id)];
  const audit = await listAuditByResources(ctx.db, entityIds.slice(0, 400), 40);
  const openAlerts = t.alerts.filter((a) => a.status === "open");
  const ordered = comp ? (comp.clinician_order ? [...comp.result.cards].sort((a, b) => comp.clinician_order!.indexOf(a.option_id) - comp.clinician_order!.indexOf(b.option_id)) : comp.result.cards) : [];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">{p.display_name}</h1><p className="text-sm text-muted">{p.module_id} · age band {p.age_band} · assigned to you</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <StateBadge state={latest?.state ?? null} />
          <Badge tone={p.consent.clinical ? "green" : "red"}>Clinical consent: {p.consent.clinical ? "on" : "off"}</Badge>
          <a className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold" href={`/api/patients/${id}/export?format=pdf`}><Download size={14} aria-hidden /> Summary PDF</a>
          <a className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold" href={`/api/patients/${id}/export?format=csv`}><Download size={14} aria-hidden /> CSV</a>
        </div>
      </div>

      {openAlerts.map((a) => (
        <Banner key={a.id} tone={a.state === "URGENT" ? "danger" : "warn"} title={`${a.state.replace(/_/g, " ")} alert — OPEN, not acknowledged`}>
          <p>{a.summary}</p><p className="mt-1 text-xs">Created {a.created_at.slice(0, 16).replace("T", " ")}. Acknowledged only when a clinician records a disposition below. The system makes no claim of delivery or 24/7 monitoring.</p>
        </Banner>
      ))}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Patient summary" className="lg:col-span-1">
          <p className="mb-2 text-sm">Profile completeness: <strong>{p.completeness.percent}%</strong></p>
          <ul className="mb-3 space-y-1 text-sm">{p.completeness.items.map((i) => <li key={i.key} className="flex justify-between gap-2"><span>{i.label}</span><Badge tone={i.status === "complete" ? "green" : i.status === "unverified" ? "amber" : "red"}>{i.status}</Badge></li>)}</ul>
          <Table head={["Item", "Value", "Provenance"]}>
            {(Object.entries(p.profile.fields) as [string, Datum][]).map(([k, v]) => <tr key={k}><td className="px-2 py-1.5">{k.replace(/_/g, " ")}</td><td className="px-2 py-1.5">{v.value === null ? <em>—</em> : String(v.value)}{v.unit ? ` ${v.unit}` : ""}</td><td className="px-2 py-1.5 text-xs">{v.source} · <span className={v.verification_status === "verified" ? "" : "font-bold text-amber-800"}>{v.verification_status}</span>{v.null_reason ? ` · ${v.null_reason}` : ""}</td></tr>)}
          </Table>
          <dl className="mt-3 space-y-1 text-sm">
            <div><dt className="inline font-semibold">Conditions: </dt><dd className="inline">{p.profile.conditions.map((x) => `${x.label}${x.verification_status === "verified" ? "" : " (unverified)"}`).join("; ") || "none recorded"}</dd></div>
            <div><dt className="inline font-semibold">Medications: </dt><dd className="inline">{p.profile.medications.map((m) => `${m.name} [${m.class_tag}] ${m.status}`).join("; ") || "none recorded"}</dd></div>
            <div><dt className="inline font-semibold">Allergies: </dt><dd className="inline">{p.profile.allergy_status === "unknown" ? "UNKNOWN (unverified)" : p.profile.allergy_status === "none_known" ? "none known" : p.profile.allergies.map((a) => `${a.substance} [${a.class_tag}]`).join("; ")}</dd></div>
            <div><dt className="inline font-semibold">Preferences: </dt><dd className="inline">{p.profile.preferences.join(", ") || "none recorded"}</dd></div>
            <div><dt className="inline font-semibold">Genotype reports: </dt><dd className="inline">{p.profile.genotype_reports.map((g) => `${g.gene} ${g.phenotype} (${g.status})`).join("; ") || "none on file"}</dd></div>
          </dl>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          <Card title="Longitudinal timeline">
            <TimelineChart series={t.series} events={t.medication_events} rows={t.rows} conflicts={t.conflicts} />
          </Card>
          <Card title="What changed">
            <ul className="list-disc space-y-1 pl-5 text-sm">{t.what_changed.items.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </Card>
        </div>
      </div>

      <Card title={<span className="flex flex-wrap items-center gap-2">Potential options to consider <IllustrativeBadge /></span>}>
        {c.gate.blocked && !comp && <Banner tone={c.gate.safety_state === "URGENT" ? "danger" : "warn"} title={`Option comparison blocked — safety state: ${c.gate.safety_state ?? "none"}`}>{c.gate.reason}</Banner>}
        {c.gate.blocked && comp && <Banner tone="warn" title={`Latest safety state ${c.gate.safety_state ?? "none"} — new comparisons are blocked`}>The comparison below was generated for an earlier, safe check-in and should be treated as stale until safety review is complete.</Banner>}
        {comp ? (
          <>
            <p className="mb-2 text-xs text-muted">Comparison {comp.id} · evidence {comp.result.evidence_version} · review state: <strong>{comp.review_state}</strong> · generated {comp.created_at.slice(0, 16).replace("T", " ")}. Clinician-facing only. No doses, no success probabilities.</p>
            {comp.result.ranking_note && <Banner tone="warn" title="No confident personalised ranking">{comp.result.ranking_note}</Banner>}
            {comp.result.missing_fields.length > 0 && <p className="my-2 text-sm"><strong>Missing / unverified critical checks:</strong> {comp.result.missing_fields.map((m) => `${m.label} (${m.reason})`).join("; ")}</p>}
            {comp.clinician_order && <p className="my-2 text-sm"><Badge tone="teal">Reordered by clinician</Badge> Rationale: {comp.reorder_rationale}</p>}
            <OptionCards cards={ordered} />
            {comp.result.withheld.length > 0 && <div className="mt-3 space-y-2">{comp.result.withheld.map((w) => <Banner key={w.option_id} tone="warn" title={w.label}>{w.message}</Banner>)}</div>}
            <ul className="mt-3 list-disc pl-5 text-xs text-muted">{comp.result.limitations.map((l, i) => <li key={i}>{l}</li>)}</ul>
          </>
        ) : !c.gate.blocked && <p className="text-sm text-muted">No comparison yet. Generate one below (requires a successful safety gate).</p>}
      </Card>

      <ClinicianActions patientId={id} comparison={comp ? { id: comp.id, cards: ordered.map((x) => ({ option_id: x.option_id, label: x.label, status: x.status })) } : null} openAlerts={openAlerts.map((a) => ({ id: a.id, state: a.state }))} gateBlocked={c.gate.blocked} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Plan version history (immutable)">
          {t.plans.length === 0 ? <p className="text-sm text-muted">No signed plans.</p> : <ol className="space-y-3 text-sm">{[...t.plans].reverse().map((pl) => <li key={pl.id} className="rounded-lg border border-line p-2"><p className="font-semibold">v{pl.version} · signed {pl.signed_at.slice(0, 16).replace("T", " ")} by {pl.signed_by}{pl.supersedes ? ` · supersedes v${pl.supersedes}` : ""}</p><p className="text-muted">Reason: {pl.reason}</p><ul className="list-disc pl-5">{pl.items.map((i, k) => <li key={k}>{i.text}</li>)}</ul></li>)}</ol>}
        </Card>
        <Card title="Signed decisions">
          {t.decisions.length === 0 ? <p className="text-sm text-muted">None yet.</p> : <ul className="space-y-2 text-sm">{[...t.decisions].reverse().slice(0, 12).map((x) => <li key={x.id} className="rounded-lg border border-line p-2"><p className="font-semibold">{x.action.replace(/_/g, " ")} · {x.signed_at.slice(0, 16).replace("T", " ")}</p><p className="text-muted">{x.signed_by_name} · {x.evidence_version}{x.plan_version ? ` · plan v${x.plan_version}` : ""}</p><p>{x.rationale}</p></li>)}</ul>}
        </Card>
      </div>
      {t.followups.length > 0 && <Card title="Patient follow-up reports">
        <ul className="space-y-1 text-sm">{t.followups.map((f) => <li key={f.id}>{f.created_at.slice(0, 16).replace("T", " ")} · plan v{f.plan_version} · {f.response} · side effects: {f.side_effects.join(", ") || "none"} ({f.severity}) {f.reviewed ? <Badge tone="green">reviewed</Badge> : <Badge tone="amber">unreviewed</Badge>} {f.note && `— ${f.note}`}</li>)}</ul>
      </Card>}
      <Card title="Audit history for this patient">
        <Table head={["Time", "Action", "Outcome", "Actor", "Version / rules"]}>
          {audit.map((e) => <tr key={e.id}><td className="px-2 py-1.5 text-xs">{e.ts.slice(0, 19).replace("T", " ")}</td><td className="px-2 py-1.5">{e.action}</td><td className="px-2 py-1.5">{e.outcome}</td><td className="px-2 py-1.5">{e.actor_id}</td><td className="px-2 py-1.5 text-xs">{[e.module_version && `${e.module_id}@${e.module_version}`, e.rule_ids?.length ? `rules: ${e.rule_ids.join(",")}` : ""].filter(Boolean).join(" · ")}</td></tr>)}
        </Table>
      </Card>
    </div>
  );
}
