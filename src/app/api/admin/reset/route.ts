import { handle } from "@/lib/api";
import { resetDemo } from "@/services/admin";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = (req: Request) => handle(req, (c) => resetDemo(c));
