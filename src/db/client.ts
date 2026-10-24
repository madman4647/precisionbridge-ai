import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { DDL, TABLE_NAMES } from "./ddl";

export type DB = PgDatabase<any, any, any>;

interface Holder { db?: DB; init?: Promise<DB>; seeded?: Promise<void>; moduleCacheVersion: number }
const g = globalThis as unknown as { __pb?: Holder };
const holder: Holder = (g.__pb ??= { moduleCacheVersion: 0 });

async function open(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  let db: DB;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    db = drizzle(neon(url)) as unknown as DB;
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = new PGlite(process.env.PGLITE_DIR || undefined);
    await client.waitReady;
    db = drizzle(client) as unknown as DB;
  }
  for (const stmt of DDL) await db.execute(sql.raw(stmt));
  return db;
}

export function getRawDb(): Promise<DB> {
  return (holder.init ??= open());
}

/** Opens the DB, creates tables, and seeds deterministically if empty. */
export async function getDb(): Promise<DB> {
  const db = await getRawDb();
  holder.seeded ??= (async () => {
    const rows = await db.execute(sql.raw("SELECT count(*)::int AS n FROM patients"));
    const n = Number((rows as any).rows?.[0]?.n ?? (rows as any)[0]?.n ?? 0);
    if (n === 0) {
      const { seedAll } = await import("./seed/seed");
      await seedAll(db);
    }
  })().catch((e) => { holder.seeded = undefined; throw e; });
  await holder.seeded;
  return db;
}

export async function truncateAll(db: DB): Promise<void> {
  for (const t of TABLE_NAMES) await db.execute(sql.raw(`DELETE FROM ${t}`));
  bumpModuleCache();
}

export function bumpModuleCache() { holder.moduleCacheVersion++; }
export function moduleCacheVersion() { return holder.moduleCacheVersion; }

/** Test helper: drop the singleton so a fresh in-memory DB is created. */
export function resetClientForTests() { holder.db = undefined; holder.init = undefined; holder.seeded = undefined; }
