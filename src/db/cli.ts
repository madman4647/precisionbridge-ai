import { getRawDb } from "./client";
import { resetAndSeed, seedAll } from "./seed/seed";
import { sql } from "drizzle-orm";

async function main() {
  const cmd = process.argv[2];
  const db = await getRawDb();
  if (cmd === "reset") {
    const r = await resetAndSeed(db);
    console.log(`Reset + seeded ${r.patients} synthetic patients, ${r.checkins} check-ins.`);
  } else if (cmd === "seed") {
    const rows: any = await db.execute(sql.raw("SELECT count(*)::int AS n FROM patients"));
    const n = Number(rows.rows?.[0]?.n ?? rows[0]?.n ?? 0);
    if (n > 0) { console.log(`Database already has ${n} patients; use db:reset to reseed.`); return; }
    const r = await seedAll(db);
    console.log(`Seeded ${r.patients} synthetic patients, ${r.checkins} check-ins.`);
  } else { console.error("usage: cli.ts seed|reset"); process.exit(1); }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
