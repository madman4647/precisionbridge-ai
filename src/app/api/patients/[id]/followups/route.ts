import { handle, body, type Params } from "@/lib/api";
import { submitFollowUp } from "@/services/checkins";
export const runtime = "nodejs";
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; const b = await body(req); return handle(req, (c) => submitFollowUp(c, id, b)); };
