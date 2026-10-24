import type { Manifest } from "../modules/schema";
import type { GenotypeReport } from "../types";

export type PgxReason = "no_supported_pair" | "report_absent" | "report_indeterminate" | "report_outdated" | "report_expired" | "phenotype_not_actionable" | "applicable";

export interface PgxResult {
  applicable: boolean;
  headline: string;
  reason: PgxReason;
  detail?: string;
  gene?: string;
  phenotype?: string;
  guideline_source_id?: string;
  report_id?: string;
}

/**
 * PGx is shown only for: a present, valid, non-expired genotype report AND a drug–gene pair listed in the
 * module's drug_gene_evidence. Genotype is never inferred. No module-specific branching: modules without
 * drug_gene_evidence always return "No actionable PGx conclusion".
 */
export function evaluatePgx(manifest: Manifest, optionId: string, reports: GenotypeReport[], now: Date = new Date()): PgxResult {
  const none = (reason: PgxReason, detail: string, extra: Partial<PgxResult> = {}): PgxResult => ({ applicable: false, headline: "No actionable PGx conclusion", reason, detail, ...extra });
  const pairs = manifest.drug_gene_evidence.filter((p) => p.option_id === optionId);
  if (pairs.length === 0) return none("no_supported_pair", "No guideline-supported drug–gene pair for this option in this module.");
  let best: PgxResult | null = null;
  for (const pair of pairs) {
    const rep = reports.filter((r) => r.gene === pair.gene).sort((a, b) => b.reported_at.localeCompare(a.reported_at))[0];
    let res: PgxResult;
    if (!rep) res = none("report_absent", `No ${pair.gene} genotype report on file. Testing is not ordered or implied by this system.`, { gene: pair.gene });
    else if (rep.status === "indeterminate") res = none("report_indeterminate", `${pair.gene} report is indeterminate.`, { gene: pair.gene, report_id: rep.report_id });
    else if (rep.status === "outdated") res = none("report_outdated", `${pair.gene} report is marked outdated.`, { gene: pair.gene, report_id: rep.report_id });
    else if (rep.expires_at && new Date(rep.expires_at).getTime() < now.getTime()) res = none("report_expired", `${pair.gene} report expired on ${rep.expires_at.slice(0, 10)}.`, { gene: pair.gene, report_id: rep.report_id });
    else if (!pair.actionable_phenotypes.includes(rep.phenotype)) res = none("phenotype_not_actionable", `Reported ${pair.gene} phenotype (${rep.phenotype}) is not listed as actionable for this pair.`, { gene: pair.gene, phenotype: rep.phenotype, report_id: rep.report_id });
    else {
      return {
        applicable: true,
        headline: `PGx consideration: ${pair.gene} ${rep.phenotype.replace(/_/g, " ")}`,
        reason: "applicable",
        detail: `${pair.statement} Source: ${pair.guideline_source_id}. Additional clinical consideration only — no dose or switch instruction is generated.`,
        gene: pair.gene,
        phenotype: rep.phenotype,
        guideline_source_id: pair.guideline_source_id,
        report_id: rep.report_id,
      };
    }
    best = best ?? res;
  }
  return best!;
}
