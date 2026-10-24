import { handle, type Params } from "@/lib/api";
import { exportClinicianSummary } from "@/services/exports";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; const f = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "pdf"; return handle(req, (c) => exportClinicianSummary(c, id, f)); };
