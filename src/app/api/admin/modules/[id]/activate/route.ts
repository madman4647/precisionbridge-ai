import { handle, body, type Params } from "@/lib/api";
import { activate } from "@/services/admin";
import { fail } from "@/services/context";
export const runtime = "nodejs";
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; const b = (await body(req)) as { version?: string }; return handle(req, async (c) => (b.version ? activate(c, id, b.version) : fail(422, "version required"))); };
