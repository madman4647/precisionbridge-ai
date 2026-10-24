import { handle, type Params } from "@/lib/api";
import { exportCohort } from "@/services/exports";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; const f = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "csv"; return handle(req, (c) => exportCohort(c, id, f)); };
