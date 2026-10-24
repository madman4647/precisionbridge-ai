# Limitations — what is illustrative vs functional

**Everything here uses synthetic data and is not for clinical use.** 100% performance on handcrafted fixtures is a demo gate, not evidence of safety in the field (PRD §15).

## Functional (real behaviour, tested)
- Deterministic, versioned, fail-closed safety engine with four states; structured answers beat free text; missing/contradictory data never yields ROUTINE; error/timeout → `UNABLE_TO_ASSESS`.
- Option comparison gating (URGENT/UNABLE blocked), hard exclusions on *verified* data, abstention on missing/unverified critical fields, evidence-withholding (missing/expired source), interaction-coverage warnings.
- Server-side RBAC with audited denials; clinician-assigned patient scoping; signed, immutable, versioned decisions and plans.
- Consent-gated, de-identified research view; small-cell suppression; Wilson intervals; reproducible saved cohorts; hypothesis caveats; dated mock trial pre-screen.
- Module validation (schema, rule DSL, approver, expiry), activation/rollback, a 4th module loaded without code changes.
- Audit log (rule ids + module version, alerts, decisions, consent, research access, denials).

## Illustrative only
- **All clinical content** — red-flag thresholds ("demo threshold, not clinically validated"), option cards (drug *classes* only, `illustrative: true`), contraindication rules, interaction coverage lists, PGx phenotype lists, evidence categories, emergency/help copy and crisis-line text. **No qualified clinician has reviewed or signed any of it.** `clinical_approver` fields are explicit placeholders.
- Guideline sources are referenced by **id / title / year only**; no recommendation text is quoted or attributed. Publication dates are approximate (year or year-month) and must be checked against the sources. Hypertension has *no* guideline attributed (a clearly-labelled placeholder slot) because PRD §20 lists none.
- Research outcomes, treatment-response patterns and the "spurious correlation" are generator artefacts (built-in confounding by indication). Nothing is evidence of efficacy.
- Trial registry is a fictional, dated snapshot (`MOCK-*`). Not ClinicalTrials.gov data.
- KPIs are computed from labelled fixtures; usability and end-to-end completion are *not measured in-app* (E2E is the Playwright suite; usability needs a timed user study). Performance numbers are in-process means, not p95 on target hardware.

## Not implemented / out of scope
- Real authentication (demo role switcher with a signed cookie), real EHR/FHIR integration, real PGx lab ingestion, live trial API sync, deployment-grade alert routing/paging.
- No claim of dispatch, 24/7 monitoring or clinician acknowledgement unless a clinician actually acknowledges in the UI.
- Jurisdiction/regulatory review (DPDP Act, CDSCO) is not performed; this is not proof of compliance and not a medical device.
- Re-identification protection is limited to small-cell suppression, no row-level export and audited queries; a formal anonymisation-risk review is required before any real use.
- Audit events are append-only by convention (no update/delete API) but not cryptographically chained.
