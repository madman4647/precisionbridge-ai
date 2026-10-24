import { handle, body } from "@/lib/api";
import { runCohortQuery } from "@/services/research";
export const runtime = "nodejs";
export const POST = async (req: Request) => { const b = await body(req); return handle(req, (c) => runCohortQuery(c, b)); };
