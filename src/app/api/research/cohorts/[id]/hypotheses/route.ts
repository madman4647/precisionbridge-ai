import { handle, type Params } from "@/lib/api";
import { generateHypothesesForCohort, listHypothesesForCohort } from "@/services/research";
export const runtime = "nodejs";
export const GET = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => listHypothesesForCohort(c, id)); };
export const POST = async (req: Request, { params }: Params) => { const { id } = await params; return handle(req, (c) => generateHypothesesForCohort(c, id)); };
