# Decisions, assumptions and tradeoffs

## Plan (as built)
Phases: (1) foundation — schema, repos, demo auth + RBAC, audit, manifest schema/validator, seed generator, watermark layout; (2) hypertension vertical slice; (3) T2D + depression via manifests only (zero core changes); (4) research wing; (5) P1 — hypotheses, trial pre-screen, PDF/CSV exports, optional LLM wording; (6) hardening — T01–T18, Playwright, KPIs, docs.

## PRD ambiguities resolved
| Topic | Decision |
|---|---|
| Precedence of states | `URGENT > UNABLE_TO_ASSESS > PROMPT_REVIEW > ROUTINE`. Missing/contradictory data beside a PROMPT trigger yields UNABLE_TO_ASSESS (more conservative: blocks comparison); triggered rule ids and missing fields are still recorded and both route to clinician review. |
| `PROMPT_REVIEW` and comparison | Not blocked (PRD blocks only URGENT/UNABLE). Draft comparison is generated for ROUTINE and PROMPT_REVIEW, clinician-only. |
| Free text | Escalate-only via manifest keywords (→ PROMPT_REVIEW). It can never reduce a state. |
| Units | `measure_definitions` give allowed units + factors. Unknown unit or implausible value (e.g. 5.5 "mg/dL") ⇒ flagged, value excluded, state ≥ UNABLE_TO_ASSESS. Series-level unit changes/jumps are flagged on the timeline (T17). |
| Hard exclusions | Apply only when every underlying fact is **verified**. Unverified/unknown ⇒ `requires_manual_review` with a "possible exclusion on unverified data" reason — never a silent exclusion or silent pass. |
| "Eligible" cards when critical fields are missing | Cards still display (Scene 2) but all are `requires_manual_review`, shown in neutral evidence-category order with "No confident personalised ranking". |
| Interaction coverage (T16) | Manifest lists covered medication classes; an active class outside it adds a coverage warning and forces manual review. |
| Plan versions | Every `approve_plan / request_more_data / record_alternative / refer_to_human_service` creates a new immutable `care_plans` version (`supersedes`, signer, time, reason). Medication items carry over unless replaced. `(patient_id, version)` is unique. Reordering options is itself a signed decision with mandatory rationale. |
| Alerts | An alert is `open` until a clinician records a disposition (decision linked to the alert, or acknowledge endpoint). Patients never see "acknowledged" unless that happened. |
| Entities embedded vs tabled | `Observation`, `Condition`, `Allergy`, `GenotypeEvidence`, `MedicationExposure` live inside the patient profile / risk evaluation; `GuidelineSource` inside module manifests; `ResearchAggregate` and `TrialSnapshot` are computed/static JSON. Other PRD entities have tables (jsonb payload + indexed columns). |
| Hypertension guideline | PRD §20 lists no hypertension guideline, so a visibly empty placeholder source is used rather than attributing content to a real guideline. |
| T2D/HTN vs "PGx only in depression" | Core is generic: PGx applies only if a module has `drug_gene_evidence`; only depression does. Hypertension/T2D patients with genotype reports still get "No actionable PGx conclusion". |
| Small-cell suppression | Cells with n < threshold are fully hidden; if outcome-N < threshold the proportion/CI are hidden; totals count displayed cells only (avoids differencing); baseline-difference rows are withheld if any of their cells is suppressed. |
| Research record revocation | Records are consent-checked at **query time** against the latest consent row, so revocation takes effect immediately; exclusion counts (no identities) are audited. |
| Spurious-correlation fixture | An unrelated endpoint (`portal_satisfaction`) is generated to track particular treatment classes. It surfaces as a hypothesis with full caveats and no literature support. |
| Labels vs data | Expected safety states for fixtures are produced by the generator but returned separately (`labels`) and never written to the DB. |

## Technical choices
- **Next.js 15 + React 19**, Tailwind v4. shadcn/ui was not initialised (needs interactive CLI/network); the small set of shadcn-style primitives is hand-written in `src/components/ui.tsx` (status always icon + text, never colour only).
- **TypeScript 5.9** (not 7): Next 15 could not load the native TS 7 preview for path aliases/config.
- **DB**: Drizzle with `pglite` (default) or `neon-http` (`DATABASE_URL`); one repository layer typed against `PgDatabase`. DDL is idempotent `CREATE TABLE IF NOT EXISTS` mirrored from the Drizzle schema (no migration tool needed for a demo). neon-http has no transactions, so writes are ordered and idempotent where it matters; plan-version uniqueness is DB-enforced.
- **Auth**: `jose` HS256 signed httpOnly cookie → demo user. RBAC lives in `src/core/rbac.ts` and is enforced in services (route handlers and server components both call the same services); denials write `access.denied` audit events and return no payload.
- **LLM**: raw `fetch` to the Messages API (model `claude-haiku-5-5`), optional. Never sets safety state, creates cards or invents evidence; safety-critical and PHQ-9 items are never reworded; outputs must preserve numbers and avoid directive/dose language or they fall back to the approved text.
- **Rule DSL** (`src/core/modules/dsl.ts`): Zod-validated, depth-limited, Kleene three-valued evaluation (unknown ≠ false). No `eval`/`Function` (enforced by an architecture test).
- **Disease neutrality**: an architecture test greps `src/core` for `module === 'depression'`-style branching. Seed/generator tooling (not core) contains per-module synthetic-data tables.
- **Time**: seed data is anchored at 2026-10-20 for determinism; module evidence expiry is checked against the real clock.

## Known gaps / next steps
Hypertension-only vertical slice was built first, then T2D/depression were ported with no core change. Remaining ideas: cryptographic audit chaining, per-patient assignment management UI, p95 performance harness, PDF layout polish, a11y audit with a screen reader.
