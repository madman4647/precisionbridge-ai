import { BookOpen, Dna, TriangleAlert } from "lucide-react";
import { Badge, IllustrativeBadge, OptionStatusBadge } from "@/components/ui";
import type { OptionCardView } from "@/core/options/pipeline";

export function OptionCards({ cards }: { cards: OptionCardView[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <article key={c.option_id} aria-label={c.label} className="flex flex-col gap-2 rounded-xl border border-line bg-white p-3">
          <header className="space-y-1">
            <h3 className="font-semibold">{c.label}</h3>
            <div className="flex flex-wrap gap-1"><OptionStatusBadge status={c.status} />{c.illustrative && <IllustrativeBadge />}<Badge>{c.option_type === "non_drug" ? "Non-drug" : "Drug class"}</Badge></div>
          </header>
          <p className="text-xs text-muted">{c.indication_context}</p>
          <div className="text-sm"><p className="font-medium">Why it may be relevant</p><p>{c.why_relevant}</p></div>
          <div className="text-sm"><p className="font-medium">Why it may not suit</p><p>{c.why_may_not_suit}</p></div>
          {c.exclusion_reasons.length > 0 && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-950"><p className="flex items-center gap-1 font-semibold"><TriangleAlert size={14} aria-hidden /> Excluded by rule</p><ul className="list-disc pl-5">{c.exclusion_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></div>}
          {(c.status_reasons.length > 0 || c.missing_checks.length > 0 || c.cautions.length > 0 || c.coverage_warnings.length > 0) && (
            <div className="rounded-lg bg-amber-50 p-2 text-sm text-amber-950">
              <p className="font-semibold">Manual review needed / cautions</p>
              <ul className="list-disc pl-5">
                {c.missing_checks.map((m, i) => <li key={`m${i}`}>Missing check: {m}</li>)}
                {c.status_reasons.map((m, i) => <li key={`s${i}`}>{m}</li>)}
                {c.cautions.map((m, i) => <li key={`c${i}`}>{m}</li>)}
                {c.coverage_warnings.map((m, i) => <li key={`w${i}`}>{m}</li>)}
              </ul>
            </div>
          )}
          <div className="text-sm"><p className="font-medium">Considerations</p><ul className="list-disc pl-5">{c.considerations.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          {c.preference_notes.length > 0 && <ul className="text-sm">{c.preference_notes.map((n, i) => <li key={i}><Badge tone={n.effect === "aligns" ? "green" : "amber"}>{n.effect === "aligns" ? "Aligns with preference" : "Conflicts with preference"}</Badge> {n.note}</li>)}</ul>}
          <div className="rounded-lg border border-line p-2 text-sm"><p className="flex items-center gap-1 font-medium"><Dna size={14} aria-hidden /> Pharmacogenomics</p>
            <p className={c.pgx.applicable ? "font-semibold" : "text-muted"}>{c.pgx.headline}</p>{c.pgx.detail && <p className="text-xs text-muted">{c.pgx.detail}</p>}</div>
          <details className="mt-auto rounded-lg border border-line p-2 text-sm">
            <summary className="flex items-center gap-1 font-medium"><BookOpen size={14} aria-hidden /> Evidence drawer ({c.evidence.length})</summary>
            <ul className="mt-2 space-y-2">{c.evidence.map((e, i) => (
              <li key={i} className="rounded bg-slate-50 p-2">
                <p className="font-semibold">{e.source_title}</p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
                  <dt>Module</dt><dd>{e.module_id} v{e.module_version}</dd><dt>Source id</dt><dd>{e.guideline_source_id}</dd><dt>Publisher</dt><dd>{e.source_publisher}</dd>
                  <dt>Published</dt><dd>{e.published}</dd><dt>Last reviewed</dt><dd>{e.reviewed}</dd><dt>Jurisdiction</dt><dd>{e.jurisdiction}</dd><dt>Population</dt><dd>{e.applicable_population}</dd><dt>Rationale</dt><dd>{e.rationale}</dd>
                </dl>
              </li>))}</ul>
          </details>
        </article>
      ))}
    </div>
  );
}
