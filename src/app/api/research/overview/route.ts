import { handle } from "@/lib/api";
import { researchOverview } from "@/services/research";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(req, (c) => researchOverview(c));
