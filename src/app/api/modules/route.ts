import { handle } from "@/lib/api";
import { listModules } from "@/services/admin";
export const runtime = "nodejs";
export const GET = (req: Request) => handle(req, (c) => listModules(c));
