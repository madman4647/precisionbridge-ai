import { handle, body, type Params } from "@/lib/api";
import { submitCheckIn } from "@/services/checkins";
import { guardPatient } from "@/services/context";
import { listCheckIns } from "@/db/repo";
import { ok } from "@/services/context";
export const runtime = "nodejs";
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; const b = await body(req); return handle(req, (c) => submitCheckIn(c, id, b)); };
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, async (c) => { const g = await guardPatient(c, "timeline.read", id); if (!g.ok) return g; return ok(await listCheckIns(c.db, id)); }); };
