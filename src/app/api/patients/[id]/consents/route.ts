import { handle, body, type Params } from "@/lib/api";
import { setConsent } from "@/services/patients";
import { fail } from "@/services/context";
export const runtime = "nodejs";
export const PUT = async (req: Request, { params }: Params) => { const { id } = await params; const b = (await body(req)) as { kind?: string; granted?: boolean }; return handle(req, async (c) => (b.kind === "clinical" || b.kind === "research") && typeof b.granted === "boolean" ? setConsent(c, id, b.kind, b.granted) : fail(422, "kind and granted required")); };
