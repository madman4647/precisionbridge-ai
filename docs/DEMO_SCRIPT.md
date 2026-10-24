# Demo script (PRD §18 storyboard, click by click)

Start with a fresh database: `/admin` → **Reset demo data** (or `npm run db:reset`). Use the **Demo role** switcher in the header for every role change. Keep in mind the red *DEMO ONLY — SYNTHETIC DATA — NOT FOR CLINICAL USE* banner on every screen.

## Scene 1 — Enrollment (DM-042)
1. Role: **Dr. Demo Clinician** → *Caseload* → open **DM-042** (listed under "Storyboard fixtures").
2. Patient summary card: type 2 diabetes, **kidney condition flag (unverified)**, preference `avoid_hypoglycemia`, **eGFR 52 — patient-reported, unverified**.
3. Explain provenance: each datum shows source (patient/lab/clinician), verification status and null reasons; completeness shows eGFR as *unverified*. Nothing is imputed.
4. (Optional) Role: **Patient DM-042** → *Profile*: same data from the patient's side, with the completeness indicator and editable allergies/preferences.

## Scene 2 — Routine check-in
1. Role: **Patient DM-042** → *Check-in*. Enter glucose `112` mg/dL, answer **No** to the three yes/no symptom questions, missed doses `0` → **Submit**.
2. Result: **ROUTINE** with "this does not rule out illness". No medication options appear anywhere for the patient.
3. Role: **Dr. Demo Clinician** → **DM-042**. *Potential options to consider*: option cards with an **Illustrative content** badge, status badges, evidence drawers (module version, source id, dates, jurisdiction, rationale, population) and "No actionable PGx conclusion".
4. Point out the banner **"No confident personalised ranking"** — renal status is unverified, so every card requires manual review and carries the missing check.

## Scene 3 — Human decision
1. Still as the clinician, *Decision composer*: action **Request more data**, patient instruction "Please upload your latest kidney blood test result.", a rationale (≥10 chars) → **Sign decision**. A new plan version is created; the *Plan version history* shows signer, time, reason and the prior version untouched.
2. Role: **Patient DM-042** → *My approved plan*: only the signed follow-up action (and the carried-over current medication). No drafts, options or rankings.
3. (Optional) Try signing with a short rationale → rejected; try approving an unknown/excluded option → rejected.

## Scene 4 — Safety stress test (DEP-017)
1. Role: **Patient DEP-017** → *Check-in* → answer **Yes** to "thinking about harming yourself… right now" (other items may stay blank) → **Submit**.
2. Immediately: **URGENT**, emergency guidance, and the notice "clinician alert recorded — **not yet acknowledged**, not monitored 24/7, nobody dispatched."
3. Role: **Dr. Demo Clinician** → *Caseload*: DEP-017 under **Urgent**. Open it: **Option comparison blocked** (ranking is not available), red alert banner "OPEN, not acknowledged".
4. Record a disposition (action **Mark alert reviewed** + rationale) → only now does the alert become acknowledged.
5. (Optional) Admin → *Fail-closed drill*: turn fault injection ON, submit a check-in as any patient → **UNABLE_TO_ASSESS**, no reassurance, no comparison. Turn it OFF afterwards.

## Scene 5 — Research insight
1. Role: **Research Analyst** → *Workbench*. Note the persistent **confounding by indication / non-causal** banner.
2. Cohort builder: Condition *Type 2 diabetes*, endpoint *Glycaemic target met at 8 weeks* → **Run cohort**. Show n / N / missing outcomes, Wilson 95% CIs, **"<10" suppressed cells**, baseline differences and the consent exclusion count.
3. **Save definition** (reproducible; re-running gives identical hashes/counts). Download CSV/PDF (watermarked, with scope, versions, review status).
4. *Hypothesis queue* → **Scan saved cohort for signals**: open a promoted candidate (the unrelated `portal_satisfaction` signal is the deliberate spurious one): signal, sample, **caveats checklist**, "Demonstration-only; not evidence of efficacy." → **Request scientific review**.
5. Show no route into care: as the researcher open `/clinician/patients/DM-042` → **403**, and the denial is in the audit log. (Optional: Patient → *Consent* → revoke research consent; the record drops out of the next query.)

## Scene 6 — Trial + portability (optional)
1. Researcher → *Trial pre-screen* → **Load consented pseudonymous records** → **Pre-screen**: dated snapshot, recruitment status, criterion-level *appears to match / appears not to match / insufficient information*; overall label never says "eligible".
2. Admin → *Modules*: pick **Invalid: no signed reviewer + malformed rule** → **Validate** → *Rejected*. Then **Valid 4th module (asthma demo)** → **Validate + activate**: loaded with no code change.
3. Admin → *KPIs* (targets vs fixture-computed values, with caveats), *Audit log* (filters), *Consent audit*, *Emergency copy* (view-only).
4. Close with `docs/LIMITATIONS.md`: this is a prototype on synthetic data — **no claim of discovered drugs or clinical effectiveness**.
