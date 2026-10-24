import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { COOKIE, verifySession } from "./session";
import { makeCtx } from "@/services/context";

export async function pageCtx() {
  const db = await getDb();
  const user = await verifySession((await cookies()).get(COOKIE)?.value);
  return { ctx: makeCtx(db, user), user };
}

import { audit } from "@/services/context";
import type { Ctx } from "@/services/context";

/** Page-level role gate: logs the denial and lets the page render a 403 view with no data. */
export async function allow(ctx: Ctx, roles: string[], path: string): Promise<boolean> {
  if (ctx.actor && roles.includes(ctx.actor.role)) return true;
  await audit(ctx, { action: "access.denied", outcome: "denied", actor_id: ctx.actor?.id ?? "anonymous", actor_role: ctx.actor?.role ?? "system", resource_type: "page", resource_id: path, details: { reason: "role not permitted for page" } });
  return false;
}
