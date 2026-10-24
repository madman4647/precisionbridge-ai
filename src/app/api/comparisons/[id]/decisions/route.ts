import { handle, body, type Params } from "@/lib/api";
import { signDecisionForComparison } from "@/services/decisions";
export const runtime = "nodejs";
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; const b = await body(req); return handle(req, (c) => signDecisionForComparison(c, id, b)); };
