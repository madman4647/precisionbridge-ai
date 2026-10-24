import { handle, body } from "@/lib/api";
import { listSavedCohorts, saveCohortDefinition } from "@/services/research";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(req, (c) => listSavedCohorts(c));
export const POST = async (req: Request) => { const b = (await body(req)) as { name?: string; definition?: unknown }; return handle(req, (c) => saveCohortDefinition(c, b.name ?? "", b.definition)); };
