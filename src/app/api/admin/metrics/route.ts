import { handle } from "@/lib/api";
import { computeKpis } from "@/services/metrics";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(req, (c) => computeKpis(c));
