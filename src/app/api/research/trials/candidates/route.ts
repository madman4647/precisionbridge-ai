import { handle } from "@/lib/api";
import { listTrialCandidates } from "@/services/research";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(req, (c) => listTrialCandidates(c, new URL(req.url).searchParams.get("condition") ?? "T2D"));
