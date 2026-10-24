import { handle, type Params } from "@/lib/api";
import { rollback } from "@/services/admin";
export const runtime = "nodejs";
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => rollback(c, id)); };
