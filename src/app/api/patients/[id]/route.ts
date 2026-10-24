import { handle, type Params } from "@/lib/api";
import { getPatientDetail } from "@/services/patients";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => getPatientDetail(c, id)); };
