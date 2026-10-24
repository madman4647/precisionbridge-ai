# PrecisionBridge AI — clickable prototype

> **SYNTHETIC DATA — NOT FOR CLINICAL USE.** A clinician-supervised decision-support and research-hypothesis prototype built from the PRD in [`docs/PRD.md`](docs/PRD.md). No real patients, no clinical validation, no 24/7 monitoring, not a medical device. All clinical content is illustrative and pending review by a qualified clinician.

It runs the full cross-role storyboard (PRD §18) on 300 deterministic synthetic patients across three disease modules (hypertension, type 2 diabetes, depression) driven purely by manifests.

## Run locally (zero setup)

```bash
npm install
npm run dev          # http://localhost:3000 — in-process PGlite, seeded on first request
```

Use the **Demo role** switcher in the header (no real login). Walk through [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app |
| `npm run typecheck` / `lint` | TypeScript strict / ESLint |
| `npm test` | Vitest: unit + contract + API-authorisation tests (T01–T18 and more) |
| `npm run test:e2e` | Playwright storyboard scenes 1–6 (builds and serves on :3100; run `npx playwright install chromium` once) |
| `npm run db:seed` | Seed an empty database (uses `DATABASE_URL`, else PGlite) |
| `npm run db:reset` | Truncate and deterministically reseed |

Admins can also press **Reset demo data** in `/admin` to restart the storyboard.

## Environment

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string (Vercel Marketplace integration sets this). Unset → PGlite. |
| `PGLITE_DIR` | Optional: persist PGlite to a folder locally (e.g. `.data/pglite`). |
| `SESSION_SECRET` | **Required in production**, ≥ 32 chars. Signs the httpOnly demo session cookie (`jose`). |
| `ANTHROPIC_API_KEY` | Optional (P1). Only paraphrases approved, non-safety check-in wording and plain-language cohort summaries; output is validated, with fallback to approved text. The app is fully functional without it. |
| `SMALL_CELL_THRESHOLD` | Research small-cell suppression threshold (default `10`). |

## Deploy to Vercel (with Neon)

1. Push this folder to a Git repo and **Import Project** in Vercel (framework: Next.js; defaults are fine).
2. Add the **Neon** integration from the Vercel Marketplace to the project — it injects `DATABASE_URL`.
3. Add `SESSION_SECRET` (e.g. `openssl rand -base64 48`). Optionally `ANTHROPIC_API_KEY`, `SMALL_CELL_THRESHOLD`.
4. Deploy. The first request creates tables and seeds 300 synthetic patients (idempotent; safe if several functions race). Or run `DATABASE_URL=… npm run db:seed` once beforehand.
5. Presenters can restart the story with `/admin` → **Reset demo data**.

Without `DATABASE_URL`, each serverless instance would hold its *own* in-memory PGlite database, so state will not be shared between requests on Vercel — use Neon for any hosted demo. API routes run on the Node.js runtime.

## Architecture (short)

```
src/core         pure TypeScript, no Next.js imports, fully unit-tested
  modules/       manifest schema (Zod), condition DSL (no eval), validator, bundled registry
  safety/        deterministic rules engine (fail-closed), unit normalisation, series quality checks
  options/       option-comparison pipeline (PRD §8.4); pgx/ applicability
  research/ hypotheses/ trials/   consent-gated, de-identified analytics
  orchestrator/  Patient Wing + Research Wing orchestrators (typed outputs only)
src/modules-data hypertension.json, t2d.json, depression.json (+ samples for the portability demo)
src/db           Drizzle schema, repositories, PGlite/Neon client, deterministic seed
src/services     RBAC-enforcing application services (every denial is audited)
src/app          /patient /clinician /research /admin pages and /api routes
tests/           unit, api (authorisation), e2e (Playwright)
```

"Agents" are controlled services called by an orchestrator; each returns a typed object with `source`, `module_version`, `limitations[]`, `created_at`.

See [`docs/DECISIONS.md`](docs/DECISIONS.md) (assumptions/tradeoffs) and [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) (what is illustrative vs functional).
