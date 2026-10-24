import { handle, body, type Params } from "@/lib/api";
import { signDecision, getPatientHistory } from "@/services/decisions";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => getPatientHistory(c, id)); };
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; const b = await body(req); return handle(req, (c) => signDecision(c, id, b)); };
