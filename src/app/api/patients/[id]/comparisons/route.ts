import { handle, type Params } from "@/lib/api";
import { createComparison, getPatientComparisons } from "@/services/comparisons";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => getPatientComparisons(c, id)); };
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => createComparison(c, id)); };
