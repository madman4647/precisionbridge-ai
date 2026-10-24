import { handle, body } from "@/lib/api";
import { trialPrescreen } from "@/services/research";
import { fail } from "@/services/context";
export const runtime = "nodejs";
export const POST = async (req: Request) => { const b = (await body(req)) as { pseudo_id?: string }; return handle(req, async (c) => (b.pseudo_id ? trialPrescreen(c, b.pseudo_id) : fail(422, "pseudo_id required"))); };
