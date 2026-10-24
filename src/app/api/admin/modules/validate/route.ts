import { handle, body } from "@/lib/api";
import { validateModule } from "@/services/admin";
export const runtime = "nodejs";
export const POST = async (req: Request) => { const b = await body(req); return handle(req, (c) => validateModule(c, b)); };
