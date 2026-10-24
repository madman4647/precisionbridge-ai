import { handle, body, type Params } from "@/lib/api";
import { acknowledgeAlertOnly } from "@/services/decisions";
export const runtime = "nodejs";
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; const b = (await body(req)) as { rationale?: string }; return handle(req, (c) => acknowledgeAlertOnly(c, id, b.rationale ?? "")); };
