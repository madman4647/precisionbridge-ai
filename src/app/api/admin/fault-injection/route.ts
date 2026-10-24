import { handle, body } from "@/lib/api";
import { setFaultInjection } from "@/services/admin";
export const runtime = "nodejs";
export const POST = async (req: Request) => { const b = (await body(req)) as { safety_timeout?: boolean }; return handle(req, (c) => setFaultInjection(c, !!b.safety_timeout)); };
