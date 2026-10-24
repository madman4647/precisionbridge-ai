import { handle, type Params } from "@/lib/api";
import { getCohortSummary } from "@/services/research";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => getCohortSummary(c, id)); };
