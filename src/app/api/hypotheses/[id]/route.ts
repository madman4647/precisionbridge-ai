import { handle, body, type Params } from "@/lib/api";
import { reviewHypothesis } from "@/services/research";
export const runtime = "nodejs";
export const PATCH = async (req: Request, { params }: Params) => { const { id } = await params; const b = await body(req); return handle(req, (c) => reviewHypothesis(c, id, b)); };
