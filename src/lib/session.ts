import { SignJWT, jwtVerify } from "jose";
import { findDemoUser, type DemoUser } from "./demoUsers";

export const COOKIE = "pb_session";

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET (>= 32 chars) must be set in production");
    return new TextEncoder().encode("dev-only-session-secret-not-for-production-use");
  }
  return new TextEncoder().encode(s);
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({ uid: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("12h").sign(secret());
}

export async function verifySession(token: string | undefined | null): Promise<DemoUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return findDemoUser(String(payload.uid)) ?? null;
  } catch { return null; }
}

export function tokenFromCookieHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export async function actorFromRequest(req: Request): Promise<DemoUser | null> {
  return verifySession(tokenFromCookieHeader(req.headers.get("cookie")));
}
