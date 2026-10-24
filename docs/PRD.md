
Product Requirements Document
EXL Live Project | Two-Wing Multi-Agent Platform for Personalized Medicine and Research Insights
Document version: 1.0 (proposed final MVP after three design iterations)Date: 23 October 2026Status: Product specification for prototype; not a clinically validated deviceProject domain: Drug Discovery & Personalized MedicineAudience: Product manager, engineering, clinical reviewer, research analyst and EXL project sponsorExisting project baseline: Disease-agnostic patient/research architecture, pluggable disease modules, emergency escalation and clinician-approval principles are designed. Development, integration and validation described below are proposed deliverables, not reported accomplishments.
1. Executive summary
Working product name: PrecisionBridge AI. PrecisionBridge AI is a clinician-supervised decision-support and research-hypothesis platform. It uses two connected but permission-separated workflows:
Patient Wing: collects consented patient profile and structured check-ins; checks for high-priority safety indicators; organizes longitudinal outcomes; compares guideline-supported treatment options for clinician review; and follows up on the clinician-approved care plan.
Research Wing: analyzes consent-authorized, de-identified or synthetic treatment-response records to describe responder subgroups, flag exploratory repurposing hypotheses and pre-screen against publicly documented clinical-trial criteria. Researchers cannot initiate patient treatment changes.
The product promise: reduce information-fragmentation and manual review effort while making potential insights easier to investigate. It does not diagnose independently, prescribe, guarantee monitoring, infer individual causality, discover new molecular compounds or establish drug efficacy.
Core product loop: Patient data → safety-first analysis → clinician-reviewed decision → approved plan + structured outcome monitoring → governed research dataset → exploratory subgroup/trial insights → researcher/clinician review → updated evidence modules only after review. There is no automatic feedback from research hypotheses to active patient recommendations.
Demo scope: adults with one primary supported condition—hypertension, type 2 diabetes, or depression—using synthetic records. Comorbidities may be entered as exclusion, interaction or caution factors. Mixed-disease treatment optimization, real-world clinical deployment and live genetic-test ordering are out of scope.
Value proposition by stakeholder:
User
Job to be done
Primary value
Trust requirement
Patient
Report symptoms and understand follow-up
Short check-ins, understandable status and approved plan
Never receive autonomous medication advice; clear escalation route
Treating clinician
Review changing risk and relevant options
One longitudinal view; reasons, evidence and missing-data flags
Final decision stays with clinician; editable and auditable
Research analyst
Investigate treatment-response patterns
Cohort builder, subgroup summaries, exploratory hypothesis queue
No causal/efficacy claims from synthetic or observational correlations
Clinical administrator
Approve module content and oversee access
Versioned policies, case assignment, audit logs
Strong separation of duties and ability to disable unsafe content
2. Problem, opportunity and product hypothesis
Problem A: fragmented personalization. Clinicians evaluate condition severity, other diagnoses, current drugs, tolerability, costs, patient preferences, laboratory measures and sometimes pharmacogenomic results. Relevant evidence is spread across records, guidance and patient-reported data. A generic “AI picks the best drug” is neither realistic nor safe.
Problem B: missed response signals. Symptoms and side effects arise between visits. Unstructured or irregular feedback can make deterioration and treatment intolerance hard to notice, although digital check-ins cannot substitute for timely emergency care.
Problem C: the clinical-to-research disconnect. Treatment-response records, when appropriately governed and sufficiently reliable, can inform research questions about variation in outcomes. But small samples, missing follow-up, treatment-selection bias and confounders often create misleading associations.
Hypothesis: For synthetic test cases, a guided and explainable workflow can prepare more complete clinician reviews and better-structured exploratory research summaries than a manual spreadsheet-based process, without giving up safety controls.
Validation standard: workflow speed and correctness must be measured in prospective tests; no real-world clinical or drug-discovery benefit is claimed from the prototype.
3. Goals, non-goals and release boundaries
3.1 Goals
G1: End-to-end functioning demo for three disease modules, sharing the same underlying agent services.
G2: One patient timeline showing profile, symptoms, observations, therapies, alerts, clinician actions and follow-up.
G3: Explainable treatment-option comparison grounded in identifiable, versioned evidence, with clear abstention when information is missing.
G4: Deterministic high-risk escalation before any ranking, conversational response or research analysis.
G5: Clinician review dashboard with approve, reject, request-more-data and document-rationale controls.
G6: Permissioned research workspace for responder cohorts, uncertainty-aware repurposing signals and trial pre-screening.
G7: Testable modularity: a new disease module can be loaded without editing patient, safety, research and workflow engines.
3.2 Explicit non-goals
Autonomous diagnosis, prescribing, titration, deprescribing or medication ordering.
Patient-facing “take/change/stop this medication” recommendations.
Automated emergency dispatch or a promise of 24/7 clinical monitoring.
Direct-to-consumer psychotherapy, suicide risk management by chat alone, or chatbot replacement for psychiatric care.
Predictive precision-medicine performance based on synthetic-only training data.
Novel molecule generation, clinical effectiveness proof or automatic publication of repurposing claims.
Live EHR write access, production deployment, use of real identifiable patient records or clinical trial enrollment in the 4-week prototype.
3.3 Classification of deliverables
Already defined in the project: high-level two-wing architecture, plug-in disease concept, clinician approval requirement, emergency escalation principle and broad success metrics.
To build or demonstrate: patient workflows and agents, curated rule packs, synthetic scenarios, clinician/research dashboards, cohort analytics, trial eligibility pre-screen, test suite, logging and integrated demonstration.
Future only: clinical validation, real EHR integrations, real-world observational analyses, prospective care deployment and any regulated-use authorization.
4. User roles and access boundaries
Patient (demo): views approved care plan, records check-ins and receives general education or clinician follow-up instructions. No ranking of medication options.
Clinician: assigned to patients; sees explainable option comparison; reviews alerts and records signed decisions; no one else can approve medication changes.
Researcher: sees aggregate cohorts and synthetic/de-identified outcomes governed by consent and purpose. Cannot view direct identifiers or edit a patient care plan.
Clinical safety/admin reviewer: configures clinically approved red flags and disease-module releases; views audit records; controls emergency fallback copy. Cannot secretly override signed clinician decisions.
Platform administrator/developer: manages technical health and synthetic demo fixtures, with no default access to production patient health details.
Important separation: A researcher creating a compelling repurposing hypothesis may not push it into the patient ranking engine. Changes require evidence review, new module version, clinical approval and regression tests.
5. Three iterations with devil's-advocate assessment
Iteration 1 — Functional proof of concept (V0 → V1)
Initial feature idea: build a symptom-check-in chatbot, profile generator, treatment ranker, red-flag agent, subgroup analyzer, repurposing detector, trial matcher and two dashboards for all three diseases.
Devil's-advocate challenge: Why would a clinician trust an AI rank? What happens without test results? Does “disease-agnostic” mean one simplistic algorithm treats all diseases? If every agent is autonomous, who is accountable when their answers conflict? A broad feature list could create an impressive but medically incoherent demo.
Design changes:
Make the “agent” approach a controlled orchestrator of specialized services, not independent bots capable of executing clinical actions.
Introduce a shared normalized patient record; rules-first safety check; evidence-backed option comparison; and clinician-signed decisions.
Make check-ins disease-specific through a plug-in questionnaire schema while keeping workflow and rendering shared.
Use seeded synthetic patient journeys with known expected outputs; offer clinician comparison views and a basic aggregate cohort report.
V1 exit: a synthetic patient completes onboarding and check-in; a predefined high-risk case creates an alert; a non-urgent case produces an evidence-linked option comparison; clinician records a decision; longitudinal observations appear in a research cohort only when test consent permits.
Iteration 2 — Clinical safety and evidence integrity (V1 → V2)
Devil's-advocate challenge: The red-flag model can miss emergencies; rankings can hallucinate guidelines; CPIC results may not apply to most hypertension/diabetes drugs; cross-disease comorbidity creates hidden contraindications; biased observational data can produce false “drug discoveries”. Even a clinician reviewing an apparently polished dashboard may overtrust it.
Design changes:
Use structured, clinician-approved red-flag rules that run before model generation. NLP may suggest a follow-up question but cannot overrule structured emergency triggers.
Require provenance for each medication-related claim: disease module, version, guideline identifier, publication date, last review date, rationale and applicable population. If unsupported, display “Insufficient evidence—manual review required.”
PGx is conditional: only validated existing genotype/phenotype information, only for a drug–gene pair supported by a current guideline, and only as an additional clinical consideration; never auto-order testing or force changes to stable therapy.
Treat contraindications as hard exclusions when explicitly established and verified; missing renal function, pregnancy status, concomitant medication or other critical fields lead to abstention or restricted display, not assumed normal findings.
Research outputs report sample size, missingness, adjusted/unadjusted nature, uncertainty and explicit non-causality warnings. Repurposing is a hypothesis queue, not a treatment suggestion.
Add audit logs, access isolation, version control, explicit patient-purpose consent, small-cell suppression and alert acknowledgement status.
V2 exit: red-flag cases cannot enter a normal treatment flow; unsupported PGx results generate no recommendation; missing critical fields block unsafe ranking; all claims have citations; researchers cannot retrieve direct identifiers; any clinician edit is logged.
Iteration 3 — Focused, testable four-week MVP (V2 → V3)
Devil's-advocate challenge: Can a small project team implement everything in four weeks? Who will curate medical rules? What happens if a check-in arrives outside clinic hours? Can synthetic-only subgroup data support real insights? What is the difference between a clickable prototype and a functioning system?
Final decision: ship one complete vertical slice, then reuse it across three conditions. Separate credible core functionality from demonstration-only sophistication. Keep real-world clinical assertions out of the MVP.
V3 MVP specification:
P0 must ship: synthetic onboarding/profile, structured check-in, safety rule engine, longitudinal view, rule/option evidence card, clinician review/decision, role permissions, de-identified export gate, basic subgroup analysis, three validated mock disease modules, audit log, automated safety test suite.
P1 if P0 stable: guided natural-language question phrasing, basic trial pre-screening against a curated registry snapshot, exploratory repurposing panel with uncertainty statements, downloadable clinician/research summaries, consent audit dashboard.
P2 later: full live trial API sync, EHR/FHIR integration, real validated PGx lab ingestion, model-calibrated treatment effectiveness estimates, deployment-grade alert routing and real observational cohort methods.
V3 release bar: a demonstrably working cross-role workflow, with hard safety gates and documented limitations; not a clinically approved application.
6. Final architecture and data flow
Presentation layer: Patient app | Clinician cockpit | Research workbench | Admin/module console.
Common services: Authentication/RBAC → Consent service → Patient and visit service → Event/time-series store → Evidence and module registry → Audit and telemetry.
Patient Wing orchestrator:
Intake/Profile agent — maps data to normalized, timestamped fields.
Check-in agent — presents module questions, captures symptoms, vitals and side effects.
Safety agent — deterministic rules and triage categories; interrupts normal processing for high-risk conditions.
Option-comparison agent — retrieves eligible, versioned guidance and applies hard safety constraints; explains options for clinician only.
Monitoring agent — displays trends and schedules/records follow-ups against the clinician-approved plan; does not promise real-time observation.
Clinician gateway: actionable alert queue → patient summary → options and explanation → clinician approve/reject/edit/request information → signed decision and plan snapshot.
Research Wing orchestrator:
Data governance agent — checks purpose-specific permission, access limits and export eligibility.
Cohort/response agent — defines outcomes, time windows and responder subgroups.
Hypothesis agent — surfaces exploratory off-label/repurposing candidates only for human scientific review based on an approved evidence catalog and transparent statistical signals.
Trial pre-screening agent — compares synthetic profile with documented inclusion/exclusion criteria and highlights unknowns.
Research reporting agent — creates reviewed, caveated cohort and hypothesis summaries.
Critical architecture invariant: clinical decisions never auto-execute. Research hypotheses cannot alter clinical module content without controlled approval. All agents write typed outputs with source, version, confidence/limitations and timestamps; the policy engine has priority over LLM text.
Data-flow walkthrough
Patient check-in → data validation → safety decision (urgent / prompt_review / routine / unable_to_assess) → alert handling if urgent; otherwise profile synthesis → evidence-filtered comparison → clinician action → approved follow-up → purpose/consent gate → de-identified research table → exploratory cohort insights → researcher review.
An urgent event does not wait for a clinician response before the UI provides pre-approved emergency guidance; the system also records an alert for clinician review, but makes no claim of successful delivery unless acknowledged.
7. Functional requirements and user stories
The feature IDs below are the engineering backlog. P0 is mandatory for the 4-week demo; P1 is conditional; P2 is future.
ID
Priority
Feature / owning role
Requirement and acceptance criterion
F01
P0
Identity and RBAC / all
Roles cannot access unrelated workspaces or patients; denied attempts logged.
F02
P0
Consent and purpose / patient
Patient records clinical/research demo consents separately; research off means no row in export.
F03
P0
Profile builder / patient
Capture condition, demographics relevant to rules, history, allergy, meds, comorbidities, labs, preferences, PGx availability and provenance; mark unknown explicitly.
F04
P0
Disease-aware check-in / patient
Correct schema loads for each supported disease; stores units, timestamp, entry source and missing answers.
F05
P0
Safety triage / patient, clinician
Every new check-in is evaluated against versioned rules before ranking; urgent fixtures always enter urgent flow.
F06
P0
Clear emergency fallback / patient
Display approved, location-appropriate emergency advice; record delivery/acknowledgment status without claiming active rescue.
F07
P0
Longitudinal timeline / clinician
Clinician sees time-series observations, medication exposures, change dates, risk indicators and missingness.
F08
P0
Evidence-based option comparison / clinician
Only eligible, non-excluded options shown with reasons, evidence IDs, uncertainty and “manual review required” when incomplete.
F09
P0
Pharmacogenomic applicability / clinician
If PGx absent/invalid/not actionable for the evaluated drug, system explicitly abstains from PGx conclusion.
F10
P0
Clinician decision / clinician
Accept, reject, edit or request info; medication-related plan changes remain draft until authenticated clinician sign-off.
F11
P0
Follow-up capture / patient
Display only approved instructions; patient can report response and side effects linked to plan version.
F12
P0
Cohort data gate / research
Only consent-authorized de-identified/synthetic records enter research view; suppress direct identifiers.
F13
P0
Responder segmentation / researcher
Define response and time horizon; display subgroup n, denominators, missingness and descriptive comparison.
F14
P0
Research dashboard / researcher
Show cohort counts, outcome trends, selection criteria and caveat banners; save reproducible filter definitions.
F15
P0
Disease plug-in / admin
Three module manifests load through same schema; no branching on disease ID in core orchestration.
F16
P0
Audit and versioning / all
Log consent changes, rules evaluated, sources, alerts, AI outputs and human decisions.
F17
P0
Scenario generator / developer
Seed reproducible synthetic low-risk, urgent, missing-data, contraindication and PGx edge-case journeys.
F18
P1
Trial pre-screen / research
Show trial ID, trial source date, eligibility matches, conflicts and unknowns; never claim enrollment.
F19
P1
Repurposing hypothesis queue / research
Each hypothesis must show observational signal, evidence, confounders, sample and researcher disposition; zero automatic clinical actions.
F20
P1
Reviewer summary export / clinician, researcher
Export retains data scope, module version, source references, review status and synthetic watermark.
F21
P1
Smart question wording / patient
Model may paraphrase approved prompts but must preserve semantic safety questions and structured response capture.
F22
P2
Live integrations / clinical engineering
Requires formal integration, governance, change-control and prospective validation work package.
8. Detailed experience specifications
8.1 Patient onboarding and profiling (F02–F03)
Screen: Start → “Demo only” banner → purpose and consent → profile sections → review and edit → completeness indicator.
Fields: patient_id (random), primary_condition, age band, sex-relevant clinical variables only where required, diagnosis confirmation status, allergies + reaction, active medications and start dates, past medication intolerance, known comorbidities, relevant pregnancy status if applicable, kidney/liver data where applicable, available lab/vital measurements, existing PGx laboratory report if present, patient preferences (cost, route, adverse-effect priorities), and clinician assignment.
Each datum has value, unit, date, source (patient/clinician/lab/synthetic), verification status and null reason (not_asked, unknown, not_available, not_applicable). A missing value is never silently imputed as normal.
User story: As a clinician, I need provenance and completeness markers so I do not mistake patient-entered information for validated clinical evidence.
Acceptance: A profile with unknown allergy status stays tagged “unverified” and options that require allergy clearance do not silently proceed.
8.2 Symptom check-in and monitoring (F04, F11)
Interaction: 60–120-second target in usability testing, not guaranteed. Questions are short and adaptive: general well-being, condition-specific metric, medication adherence (nonjudgmental), side effects, acute danger symptoms and optional free text. A check-in is a snapshot—not continuous monitoring.
Hypertension example: recent blood pressure readings and units; associated symptoms; current therapy; missed doses; extreme/symptomatic reading escalation according to clinically approved scenario rules. Do not create universal patient-facing emergency thresholds without clinical sign-off.
Type 2 diabetes example: glucose measurement if available, hypoglycemia symptoms, medication exposure, new illness/dehydration symptoms and agreed follow-up metrics. Severe symptoms route to urgent assessment; no automated dose changes.
Depression example: validated measure where permitted (e.g., PHQ-9 with scoring/version controls), mood trend, adherence, side effects and directly asked self-harm concerns. Positive answers trigger an appropriate structured human-care pathway and immediate help guidance, not conversational therapy.
Outputs: timestamped observation card, trend against prior approved baseline, risk state, next pre-approved check-in date, and unresolved missing information.
8.3 Safety triage and escalation (F05–F06)
Four states:
URGENT: clinician-reviewed emergency criteria or immediate self-harm danger. Block standard option comparison, display immediate appropriate help instructions, and create an alert event.
PROMPT_REVIEW: abnormal/safety-relevant finding needing timely human review; no autonomous medication action.
ROUTINE: no triggered rules; proceed with standard workflow and clearly state that no warning does not rule out illness.
UNABLE_TO_ASSESS: missing/contradictory data or rule-engine failure; display conservative limitations and route for appropriate clinician review.
Safety protocol: structured rules take precedence; missing data cannot force ROUTINE; agent failures default to UNABLE_TO_ASSESS; no auto-clearance for alerted cases; send to human review queue and show patient instructions immediately. Escalation cannot imply clinician acknowledgement until actually confirmed.
Timing: For the prototype, display immediate messages synchronously. Back-end alert receipt targets are internal engineering SLOs; not clinical response guarantees. Real-world paging protocols must be separately designed and tested before any live use.
8.4 Treatment option comparison (F08–F10)
Output is a clinician-facing comparison, not an instruction to prescribe.
Pipeline: (1) check consent/role and safety state; (2) validate structured patient record; (3) retrieve approved disease guideline cards; (4) screen explicit contraindications/interactions and required baseline data; (5) evaluate evidence-supported PGx if truly applicable; (6) organize remaining alternatives by clinical relevance and patient preferences; (7) display transparent reasons and uncertainty; (8) require clinician decision.
Comparison card: option/class, indication context, why it may be relevant, why it may not be suitable, considerations (comorbidity, tolerability, cost/access, patient preference), evidence source/version, PGx applicability, missing checks and output status (eligible_for_review, requires_manual_review, excluded_by_rule). The engine does not generate specific dose instructions.
Suggested presentation: “Potential options to consider” rather than “Best treatment.” Default sort by clinical evidence category and safety completeness; do not use a fabricated probability of individual treatment success. The clinical reviewer may override the ordering and must supply rationale.
Illustrative pseudo-logic:
if safety_state in {URGENT, UNABLE_TO_ASSESS}:    block_treatment_comparison()elif critical_information_missing(patient, module):    return manual_review_required(missing_fields)else:    options = guideline_supported_options(module, indication)    options = classify_hard_exclusions_and_cautions(options, patient)    options = annotate_with_valid_existing_PGx_if_applicable(options, patient)    present_option_cards_to_clinician(options, evidence_ids, missingness)# A separate authenticated clinician approval is always required.
8.5 Clinician cockpit (F07, F10)
Core views: caseload queue (urgent / prompt / pending); selected patient summary; trend timeline; safety alert details; side-by-side option cards; “what changed” panel; evidence drawer; decision composer; audit history.
Decision actions: approve_plan, request_more_data, reject_candidate, record_alternative, mark_alert_reviewed, refer_to_human_service. All actions require role verification and signed timestamp. Patient messaging only reflects the reviewed final plan, not speculative drafts.
Mandatory safeguards: urgent alerts persist until human disposition; a clinician cannot modify the underlying rule evaluation; no retrospective rewriting of signed records; any updated plan creates a new version.
8.6 Research cohort and subgroup analysis (F12–F14)
Inputs: purpose-authorized response record snapshots with condition, treatment exposure, baseline state, timestamp, outcome metric, follow-up horizon, adverse events and appropriate covariates. Researcher chooses cohort filters and a single, explicit endpoint definition.
Example analysis (synthetic only): proportion meeting a clinician-defined outcome at 8 weeks among mock diabetes patients, stratified by baseline disease severity and treatment class. Include absolute n/N for each subgroup, missing outcomes, confidence interval when meaningful, differences in baseline characteristics and warning on confounding by indication.
No claim: an association, especially in synthetic data, does not demonstrate that a drug caused improvement. Any supposed subgroup “winner” stays an exploratory visualization.
Controls: minimum group-size threshold configurable (demo default: suppress cell counts below 10); record selection criteria; prevent re-identification through repeated granular filtering; anonymization risk review before real deployment; no export of direct identifiers.
8.7 Repurposing hypothesis workflow (F19)
Read permitted aggregate observations plus explicitly approved external evidence catalog.
Surface a candidate research question only if plausibly supported, documenting indication, measured outcome, direction of association, cohort limitations and source literature.
Flag alternative explanations: confounding, selection, missingness, treatment switching, multiple testing, reverse causality and small samples.
Researcher dismisses, needs_evidence, or requests_scientific_review.
A scientific reviewer may approve a hypothesis for further literature analysis or study design; nothing routes directly to clinical care.
Acceptance: a promising synthetic correlation is visibly labeled “demonstration-only; not evidence of efficacy,” and cannot appear in patient option cards.
8.8 Clinical trial pre-screening (F18)
Match structured patient features to inclusion/exclusion clauses from a curated, dated registry snapshot (or a later verified ClinicalTrials.gov API adapter). Show appears_to_match, appears_not_to_match, insufficient_information at criterion level. Overall label is “potential trial for manual review” only when sufficient relevant criteria are checked. Recruitment status and last update date appear prominently; actual eligibility must be confirmed by the trial team.
9. Disease plug-in model and sample modules
Disease manifest: module_id, module_version, condition_code, population_scope, clinical_approver, guideline_sources[], last_evidence_review, checkin_question_schema[], required_profile_fields[], measure_definitions[], red_flag_rules[], treatment_option_cards[], drug_gene_evidence[], outcome_definitions[], trial_search_terms[], validation_case_ids[], and effective_status.
Rules: schema validation is compulsory; approved modules are immutable by version; all new releases need clinical sign-off plus safety regression; unsupported scenarios return abstention. Conditions may add data and rule definitions, but cannot override the global no-autonomous-medication-change rule.
Module
Patient measurements / check-ins
Clinician considerations
Research outcome examples
Special safety constraint
Hypertension
Repeated BP readings, symptoms, adherence, adverse effects
BP context, cardiovascular risk, renal status, existing meds, preferences
BP trend within predefined follow-up window
High-risk symptoms/measurements require clinician-defined escalation
Type 2 diabetes
Glucose/HbA1c if available, symptoms of low glucose, side effects
Individualized goals, heart/kidney comorbidities, hypoglycemia risk, access
Change in clinician-defined glycemic metric
Hypoglycemia and acute metabolic illness flags supersede ranking
Depression
Mood scale, sleep/function, adherence, adverse effects, explicit self-harm screen
Patient preference, prior response, interactions, risk review, appropriate PGx
Change in validated symptom measure at agreed time
Potential self-harm requires human-led safety response and urgent-help information
PGx realism: The antidepressant module can demonstrate a guideline-supported drug–gene evidence link when validated test data exists, such as relevant CYP2D6/CYP2C19/CYP2B6 associations. CPIC says guidelines explain how to use available genotypes, not whether to order a test. Do not apply speculative PGx personalization indiscriminately to hypertension or diabetes modules.
Evidence governance: the reference content initially uses human-reviewed, bounded excerpts and structured summary cards sourced from relevant society guidelines; LLM retrieval should not invent recommendations. For an international demo, document which jurisdiction each card targets rather than silently mixing regional standards.
10. Synthetic data and demonstration design
Recommended seed dataset: 300 strictly synthetic patient profiles (100 per condition), ~4–8 longitudinal check-ins each, multiple care-plan snapshots and predetermined test outcomes. This is a proposed fixture count, not an empirical result. Use deterministic seeds for reproducibility and preserve protected edge cases even if the primary simulator generates plausible distributions.
Coverage matrix:
At least 10 routine journeys per module, 10 high-risk rule triggers per module, 10 missing/contradictory data cases per module, and focused contraindication/PGx/consent/trial cases.
Vary treatment exposure and response patterns; include incomplete follow-up, medication switches, nonadherence flags and inconsistent units to stress-test analytic integrity.
Include paired cases with identical observations but different role or consent flags to test access segregation.
Include deliberately spurious correlations to test hypothesis caveats and small-cell suppression.
Data governance: synthetic data must be computer-generated without reconstruction of real patients, not scraped from clinical records. Watermark all views/exports “SYNTHETIC DATA — NOT FOR CLINICAL USE.” Data and target labels for tests must be separately stored to avoid accidentally presenting known outcomes as model discovery.
11. Data model, services and APIs
Minimum entities: Patient, PatientConsent, Encounter/CheckIn, Observation, MedicationExposure, Condition, Allergy, GenotypeEvidence, RiskEvaluation, Alert, GuidelineSource, DiseaseModuleVersion, OptionComparison, ClinicianDecision, ApprovedCarePlan, ResearchCohortDefinition, ResearchAggregate, Hypothesis, TrialSnapshot, AuditEvent.
Data contract example (illustrative):
CheckIn {  id, patient_id, module_id, created_at, source,  observations: [{concept, value, unit, observed_at, verification_status}],  answers: [{question_id, response, version}],  patient_free_text, missing_field_codes}RiskEvaluation {  id, checkin_id, module_version, state,  triggered_rule_ids[], missing_fields[], evaluated_at}OptionComparison {  id, patient_id, profile_snapshot_id, evidence_version,  option_cards[], exclusions[], missing_fields[],  review_state: "draft" | "signed" | "rejected"}Hypothesis {  id, cohort_id, exposure, outcome, window,  subgroup_n, observed_association, caveats[], evidence_ids[],  reviewer_status, disclaimer: "exploratory_only"}
API shortlist:
POST /demo/patients and GET /patients/{id} — create/retrieve synthetic records under RBAC.
POST /patients/{id}/checkins — validate, store, synchronously safety-evaluate, return structured state.
GET /patients/{id}/timeline — provenance-aware longitudinal observations.
POST /patients/{id}/comparisons — clinician-only draft options; requires successful safety gate.
POST /comparisons/{id}/decisions — clinician-authenticated sign-off.
POST /research/cohorts and GET /research/cohorts/{id}/summary — consent-gated aggregates.
POST /research/cohorts/{id}/hypotheses — create reviewable exploratory candidates.
GET /modules and POST /admin/modules/validate — module discovery and schema/safety test.
GET /audit/events — audit permission restricted to designated authorized reviewers.
Interoperability path: future adapters can map Patient, Condition, Observation, MedicationRequest and related data types to HL7 FHIR resources. An API label does not imply EHR certification or actual interoperability has been achieved.
12. Nonfunctional, privacy and reliability requirements
Category
Prototype requirement
Validation method
Security
Role-based permissions; server-side checks; encrypted transport and storage; secrets outside source code
Threat-model checklist and automated negative access tests
Privacy
Separate research purpose consent; de-identification gate; revoke stops future processing; retention policy
Consent-off export tests and deletion/retention policy walkthrough
Auditability
Immutable audit event for rule versions, evidence IDs, clinician actions and research access
100% audited critical action test fixtures
Safety
Deterministic hard rules prior to model text; fail closed on rule-service outage
Regression suite + injected failures
Evidence
No uncited clinical option cards; retrieval limited to approved source corpus
Evidence-link test across all displayed claims
Reliability
Stable demo in supported modern browser; recoverable application state
Smoke tests and planned outage drills
Performance
Suggested demo targets: safety result under 2 s, option cards under 5 s, cohort summary under 10 s on seeded test environment
p95 test over agreed dataset and hardware; thresholds proposed, not achieved
Accessibility
Keyboard-operable forms, readable status labels, not color-only alerts
Manual accessibility checklist
Observability
Request IDs, failure rates, latency, alert event counters without sensitive payloads in logs
Logs inspection and injected error testing
Content control
Published module versions signed by assigned reviewer; rollback support
Unauthorized-module rejection and rollback tests
India deployment consideration: under the Indian DPDP Act/Rules, personal-data obligations and commencement dates require jurisdiction-specific legal review; do not treat a synthetic student demo as proof of compliance. The product may also qualify as medical device software depending on intended use and claims, so CDSCO classification and associated clinical validation must be reviewed before any real-world clinical use. No production claim of regulatory clearance is made.
13. Metrics, measurement rules and proposed release targets
All values below are proposed acceptance targets, not previously observed results.
KPI
Definition
Proposed prototype criterion
Caveat
Critical test recall
High-risk synthetic fixtures correctly routed / total labeled high-risk fixtures
100% on agreed P0 safety regression set
Not a real-world sensitivity estimate; expand dataset later
Autonomous medication changes
Number of generated or executed medication changes not signed by clinician
0
Hard architectural invariant
Evidence coverage
Clinician option cards with valid guideline source, version and rationale / all displayed option cards
100%
Sources still require clinical correctness review
Critical-field abstention
Missing critical-data fixtures correctly block/restrict comparison / all such fixtures
100%
Based on defined completeness rules
Audit capture
Critical operations with recorded user, action, timestamp and version / all critical operations
100%
Prototype telemetry target
Research isolation
Unauthorized direct-identifier access attempts returning protected data
0
Requires penetration/privacy review for deployment
Disease module portability
Supported modules using common manifest and existing engines
3/3
Does not establish unlimited disease coverage
End-to-end completion
Golden-path scenarios completed from check-in through clinician review and aggregate research
≥95% over agreed scenario set
Excludes clinical effectiveness
Clinician usability
Median task time vs manually preparing equivalent synthetic case packet
Target ≥20% faster
Pilot target; run timed user test and report actual result
Research reproducibility
Re-running same cohort definition yields same filters/counts/results
100%
On deterministic seed data
Measurement instrumentation: checkin_submitted, safety_evaluated, alert_created, comparison_generated, clinician_decision_signed, consent_changed, research_export_granted/denied, cohort_saved, hypothesis_reviewed, and trial_criteria_assessed. Every measurement includes scenario ID and version; do not include direct identifiers in analytics logging.
14. Four-week implementation plan and dependencies
Week
Focus
Deliverables
Definition of done
1
Product foundation + clinical content
User flows, reviewed risk taxonomy, module schema, patient DB, synthetic data generator, RBAC wireframes
Clinical rules have owner; end-to-end event schemas approved; fixture scenarios defined
2
Patient Wing vertical slice
Profile UI, check-ins, deterministic safety engine, evidence cards, clinician option comparison prototype
Hypertension module golden path works; critical and missing-data tests pass
3
Clinician + Research Wing, disease reuse
Signed clinician decisions, longitudinal views, research gate, cohort analysis; diabetes and depression module packs; P1 trial pre-screen if ready
One golden path per module works; unauthorized researcher access denied; research outputs show caveats
4
Integration, adversarial testing and demonstration
Regression suite, PGx applicability demo, hypothesis panel if P0 stable, audit dashboard, demo script, limitations appendix
P0 release criteria pass; all open safety defects classified; realistic demo walkthrough rehearsed
Minimum delivery capacity assumption: product owner (requirements/test coordination), one frontend engineer, one backend/AI engineer, one data/analytics engineer and part-time clinical/safety reviewer. If a licensed clinician is unavailable, ship simulated option cards clearly marked for illustration and defer any assertion of clinical guideline correctness.
Feature cutline: Never postpone consent checks, red-flag gates, clinician approval or source traceability to ship repurposing graphics. If behind schedule, remove P1 trial and hypothesis sophistication first.
15. Test strategy and adversarial cases
Testing layers: schema/unit checks → rule-engine unit tests → API authorization tests → agent grounding tests → disease-module contract tests → end-to-end UI tests → signed-off human clinical content review → demonstration rehearsal. Safety fixtures are deterministic golden tests; independent clinicians would be needed for genuine clinical validation.
Test ID
Scenario
Expected result
T01
Depression check-in explicitly reports immediate self-harm danger
Urgent message and alert; no standard comparison or generic reassuring chatbot response
T02
Diabetes patient describes severe low-glucose symptoms
Approved urgent workflow triggers before any ranking
T03
Hypertension patient has concerning symptom + measurement combination
Clinician-approved risk rule triggers; emergency guidance shown if classified urgent
T04
Current drug conflicts with documented allergy
Drug card blocked/flagged under validated module rule; explanation available
T05
Kidney function required but missing
No assumption of normal result; manual review needed
T06
Free-text says “fine” but structured red-flag answer is positive
Structured safety event wins; model cannot down-classify
T07
PGx field is absent, outdated, indeterminate or unsupported
“No actionable PGx conclusion”; do not infer genotype
T08
Clinician signed plan changes
Prior plan remains immutable; new version has signer/time/reason
T09
Research consent disabled
Record excluded from research query; access denial logged
T10
Researcher guesses a direct patient URL
403/denial without sensitive payload
T11
Subgroup cohort contains <10 entries
Sensitive cell suppressed and hypothesis not promoted
T12
Synthetic treatment appears to improve an unrelated endpoint
Association stays exploratory with confounding and non-causality caveats
T13
Trial has contradictory/unknown eligibility field
Show unknown or no-match; no definitive “eligible” label
T14
Guideline evidence source is removed/expired
Option card withheld; manual clinical review required
T15
Safety service times out
UNABLE_TO_ASSESS response; no routine reassurance or treatment comparison
T16
Drug interaction not covered by curated content
System explicitly warns coverage is incomplete; no safe-by-default claim
T17
Date/units inconsistent across repeated observations
Flag conflict; exclude suspect data from computation until resolved
T18
New module has malformed rules or no signed reviewer
Module fails validation and cannot be activated
Clinical safety test principle: 100% performance on known handcrafted hazards is the gate to a demo, not proof of safety in the field. Future deployment needs representative real-world evaluation of sensitivity, specificity, workflow effects, equity and clinician error handling.
16. Risks, failure modes and mitigations
Risk
Severity
Devil's-advocate objection
Product mitigation / owner
Undetected emergency
Critical
“A patient trusts the green status.”
Structured approved prompts, fail-closed rules, visible limitations; clinical reviewer
Unsafe or hallucinated drug option
Critical
“Source links make a wrong answer look authoritative.”
Restricted evidence corpus, validation checks, manual approval, no auto-prescribe; clinical + AI owners
Alert fatigue or unstaffed alert
High
“Who acts on red notifications?”
Explicit demo/no-monitoring notice, routing states, review queue, no fake acknowledgement; product + clinical
False discovery or confounding
High
“Observational correlations are sold as new science.”
Labels, subgroup n, uncertainty, multiple-testing awareness, scientific review; research owner
Re-identification or unauthorized access
High
“Small cohorts leak patient data.”
RBAC, de-identification, suppression, access log, purpose limits; security owner
Missing/uncertain PGx
High
“The platform guesses a gene-driven best drug.”
PGx only from valid documented tests and supported drug–gene pairs; clinical owner
Clinical workload increases
Medium
“Another dashboard generates more work.”
Prioritized queue, concise evidence drawer, quick disposition, usability time study; product owner
Three disease modules overload sprint
High
“Breadth hides an unfinished vertical slice.”
Build one full path, module-port two additional diseases, cut P1 first; engineering lead
Regulatory overclaim
High
“A student demo is marketed as medical device.”
Synthetic-only badge, claims governance, legal/CDSCO assessment before field pilot; product/legal
Synthetic data creates misleading results
High
“The model learns patterns invented by its author.”
Use synthetic data for functionality and tests only; no predictive clinical claim; research owner
17. Release checklist and acceptance sign-off
☐ Three disease manifests validate and render correctly through common services.
☐ All P0 high-risk and missing-data tests pass; no unresolved critical safety defect.
☐ All displayed options have traceable approved evidence or explicit abstention.
☐ Clinician decision required for any medication-related change in displayed plans.
☐ Research consent gate works; unauthorized access tests pass.
☐ Research summaries show denominator, missingness, time horizon and caution statement.
☐ Every screen/record exported is labeled synthetic and non-clinical.
☐ Evidence versions, rule executions, clinician decisions and research access appear in audit records.
☐ Time-based usability tests and performance tests are run; actual outcomes reported beside targets.
☐ Sponsor and clinical adviser review all claims used in the demonstration.
Sign-off roles: Product manager (scope), engineering lead (functionality and security), clinical reviewer (curated safety content and patient-facing language), research reviewer (analysis integrity), project sponsor (acceptance of demo scope). Absence of a qualified clinical reviewer is a blocker for any clinically specific recommendation claims; illustrate workflow using placeholder options instead.
18. End-to-end demonstration storyboard
Scene 1 — Enrollment: Open synthetic patient DM-042 (adult with type 2 diabetes). Show history, co-existing kidney-condition flag, preference to avoid hypoglycemia and incomplete renal lab verification. Explain provenance.
Scene 2 — Routine check-in: Enter a non-urgent synthetic check-in. Safety engine responds ROUTINE; clinician option cards appear with evidence drawers and a caution that renal status needs review, so no confident personalized ranking is presented.
Scene 3 — Human decision: Clinician requests updated data and saves a signed follow-up decision. Patient view shows only approved follow-up action, not the draft treatment choices.
Scene 4 — Safety stress test: Switch to synthetic depression patient DEP-017 and trigger an immediate self-harm-risk fixture. Screen shows the safety-first escalation branch; treatment ranking is blocked; clinician alert is generated but not falsely shown as acknowledged.
Scene 5 — Research insight: With a separately consent-enabled synthetic cohort, group patients by baseline status and show response proportions and missing follow-up. Present an explicitly speculative hypothesis, then dismiss/flag it for scientific review. Demonstrate no route into active care.
Scene 6 — Trial + portability: Optionally show a dated mock trial pre-screen, eligibility unknowns and how a new disease module is validated. Conclude with dashboard metrics and limitations, not a claim of newly discovered drugs.
19. Open decisions requiring EXL / clinical review
Does EXL prioritize treatment-personalization decision support, R&D hypothesis generation, or equal demonstration of both? This PRD assumes a shared platform with patient safety prioritized and discovery limited to hypotheses.
Who is the qualified clinical owner for approving evidence cards, red-flag rules and suicide safety copy?
Which market/jurisdiction and guideline families should the demonstration use? Avoid mixed guideline recommendations without declaration.
May any real/de-identified clinical data be used later, and under what permissions, data agreements and approvals? The MVP assumes synthetic data only.
Which evaluation matters most to EXL: workflow completeness, safety test performance, module extensibility, analyst utility or speed? The KPI table proposes a balanced baseline.
Is PGx a required demonstrable core capability, or an optional evidence-annotation scenario? This PRD treats it as conditional, evidence-dependent and clinician-only.
Will an actual clinician review the prototype? If not, use “illustrative option A/B” rather than unsupervised medication recommendations in the final presentation.
20. Reference basis and governance notes
The following are starting references for human-curated module design, not a substitute for clinical review or a certification of the prototype:
Clinical Pharmacogenetics Implementation Consortium (CPIC), guideline catalog — https://www.clinpgx.org/cpic/guidelines . Existing genotype interpretation is conditioned on guideline-supported drug–gene pairs.
CPIC guideline for serotonin reuptake inhibitor antidepressants and CYP2D6/CYP2C19/CYP2B6 (2023) — https://files.cpicpgx.org/data/guideline/publication/serotonin_reuptake_inhibitor_antidepressants/2023/37032427.pdf . Do not turn exploratory genes or absent tests into medication directives.
American Diabetes Association, Standards of Care in Diabetes—2026, pharmacologic approaches — https://diabetesjournals.org/care/article/49/Supplement_1/S183/163934/ . Individual choices involve multiple comorbidities and preferences.
NICE NG222, Depression in adults: treatment and management — https://www.nice.org.uk/guidance/ng222/chapter/Recommendations . Covers monitoring and urgent response to self-harm risk.
HL7 FHIR R4 MedicationRequest and Observation — https://hl7.org/fhir/R4/medicationrequest.html ; https://www.hl7.org/fhir/R4/observation.html . Future interoperability mapping only.
ClinicalTrials.gov API — https://clinicaltrials.gov/data-api/api . Trial data should be refreshed and eligibility verified by trial staff.
CDSCO medical-device and software guidance page — https://www.cdsco.gov.in/opencms/opencms/en/Medical-Device-Diagnostics/Medical-Device-Diagnostics/ . Intended-use claims may change regulatory obligations.
Ministry of Electronics and IT DPDP Rules 2025 and enforcement timeline — https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digital-Personal-Data-Protection-Rules-2025 . Confirm phased commencement and applicable duties through counsel.
WHO Ethics and governance of AI for health — https://www.who.int/publications/i/item/9789240084759 . Transparency, safety, governance and human oversight are design priorities.
Final product statement: PrecisionBridge AI is a modular, clinician-supervised prototype that unifies structured patient-response monitoring with transparent treatment-option review and carefully governed exploratory research insights. Its distinguishing capability is the auditable bridge between patient outcomes and research questions, without surrendering control over treatment decisions.
