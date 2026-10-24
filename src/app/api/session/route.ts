import { cookies } from "next/headers";
import { COOKIE, signSession, actorFromRequest } from "@/lib/session";
import { DEMO_USERS, findDemoUser } from "@/lib/demoUsers";
import { getDb } from "@/db/client";
import { auditWrite } from "@/db/repo";
import { json } from "@/lib/api";

export async function GET(req: Request) {
  const u = await actorFromRequest(req);
  return json({ user: u, users: DEMO_USERS });
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as { user_id?: string };
  const u = b.user_id ? findDemoUser(b.user_id) : undefined;
  if (!u) return json({ error: "unknown demo user" }, 422);
  const jar = await cookies();
  jar.set(COOKIE, await signSession(u.id), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 12 });
  try { await auditWrite(await getDb(), { action: "session.switch", outcome: "success", actor_id: u.id, actor_role: u.role, details: { demo_role_switch: true } }); } catch { /* audit is best-effort for the demo role switch */ }
  return json({ user: u });
}

export async function DELETE() {
  (await cookies()).delete(COOKIE);
  return json({ ok: true });
}
