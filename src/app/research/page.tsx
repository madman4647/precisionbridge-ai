import { pageCtx, allow } from "@/lib/page";
import { researchOverview, listSavedCohorts } from "@/services/research";
import { Denied } from "@/components/ui";
import { ResearchWorkbench } from "@/components/research/ResearchWorkbench";
import trial from "@/modules-data/trial-snapshot.json";

export default async function ResearchPage() {
  const { ctx } = await pageCtx();
  if (!(await allow(ctx, ["researcher"], "/research"))) return <Denied what="The research workbench is for researcher users. Researchers see only consent-authorised, de-identified aggregates." />;
  const [ov, saved] = await Promise.all([researchOverview(ctx), listSavedCohorts(ctx)]);
  if (!ov.ok || !saved.ok) return <Denied />;
  return <ResearchWorkbench overview={ov.data} saved={saved.data} threshold={Number(process.env.SMALL_CELL_THRESHOLD ?? 10) || 10} snapshot={{ date: trial.snapshot_date, source: trial.source }} />;
}
