import { handle } from "@/lib/api";
import { viewAudit } from "@/services/admin";
export const runtime = "nodejs";
export const GET = (req: Request) => { const q = new URL(req.url).searchParams; return handle(req, (c) => viewAudit(c, { action: q.get("action") ?? undefined, outcome: q.get("outcome") ?? undefined, actor_id: q.get("actor_id") ?? undefined, resource_id: q.get("resource_id") ?? undefined, limit: Math.min(500, Number(q.get("limit") ?? 200)) })); };
