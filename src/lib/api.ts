import { getDb } from "@/db/client";
import { actorFromRequest } from "./session";
import { makeCtx, type Ctx, type Result } from "@/services/context";
import type { ExportFile } from "@/services/exports";

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "x-demo-watermark": "SYNTHETIC DATA - NOT FOR CLINICAL USE" } });
}

/** Thin wrapper: resolves the signed-cookie actor, runs a service (which enforces RBAC), maps results to HTTP. */
export async function handle<T>(req: Request, fn: (ctx: Ctx) => Promise<Result<T>>): Promise<Response> {
  try {
    const db = await getDb();
    const actor = await actorFromRequest(req);
    const res = await fn(makeCtx(db, actor));
    if (!res.ok) return json({ error: res.error, ...(res.payload && res.status !== 403 ? { detail: res.payload } : {}) }, res.status);
    const d = res.data as unknown;
    if (d && typeof d === "object" && "filename" in (d as object) && "contentType" in (d as object)) {
      const f = d as ExportFile;
      return new Response(f.body as BodyInit, { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.filename}"`, "x-demo-watermark": "SYNTHETIC DATA - NOT FOR CLINICAL USE" } });
    }
    return json({ data: res.data, watermark: "SYNTHETIC DATA — NOT FOR CLINICAL USE" });
  } catch (e) {
    console.error("api error", e instanceof Error ? e.message : "unknown"); // never log payloads
    return json({ error: "internal error" }, 500);
  }
}

export async function body(req: Request): Promise<unknown> {
  try { return await req.json(); } catch { return {}; }
}

export type Params<T extends string = "id"> = { params: Promise<Record<T, string>> };
