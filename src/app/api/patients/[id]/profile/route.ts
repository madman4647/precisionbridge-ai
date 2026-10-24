import { handle, body, type Params } from "@/lib/api";
import { updateProfile } from "@/services/patients";
export const runtime = "nodejs";
export const PATCH = async (req: Request, { params }: Params) => { const { id } = await params; const b = await body(req); return handle(req, (c) => updateProfile(c, id, b)); };
