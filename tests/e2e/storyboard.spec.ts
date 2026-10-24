import { expect, test, type Page } from "@playwright/test";

// PRD §18 storyboard, scenes 1–6, on a freshly seeded in-memory database.
test.describe.configure({ mode: "serial" });

async function as(page: Page, userId: string) {
  await page.goto("/");
  await page.selectOption("#role-switch", userId);
  await page.waitForURL((u) => u.pathname !== "/");
}

test("every screen carries the synthetic-data watermark and Demo-only banner", async ({ page }) => {
  await as(page, "u-admin");
  await expect(page.getByRole("note").filter({ hasText: "SYNTHETIC DATA — NOT FOR CLINICAL USE" }).first()).toBeVisible();
  await expect(page.getByText("DEMO ONLY", { exact: false }).first()).toBeVisible();
});

test("scene 1 — enrollment: DM-042 provenance and unverified renal labs", async ({ page }) => {
  await as(page, "clin-1");
  await page.goto("/clinician/patients/DM-042");
  await expect(page.getByRole("heading", { name: /DM-042/ })).toBeVisible();
  await expect(page.getByText("Kidney function (eGFR)").first()).toBeVisible();
  await expect(page.getByText("unverified").first()).toBeVisible();
  await expect(page.getByText("avoid_hypoglycemia")).toBeVisible();
  await expect(page.getByText(/Kidney condition flag/)).toBeVisible();
});

test("scene 2 — routine check-in → ROUTINE; clinician sees cards with renal caution and no confident ranking", async ({ page }) => {
  await as(page, "u-patient-dm042");
  await page.goto("/patient/checkin");
  await page.getByLabel(/most recent blood glucose/).fill("112");
  for (const q of [/severe low-sugar/, /vomiting/, /shaky\/sweaty/]) await page.getByRole("group", { name: q }).getByLabel("No").check();
  await page.getByLabel(/how many doses did you miss/).fill("0");
  await page.getByRole("button", { name: "Submit check-in" }).click();
  await expect(page.getByText("ROUTINE").first()).toBeVisible();
  await expect(page.getByText(/does not rule out illness/).first()).toBeVisible();
  await expect(page.getByText(/Biguanide|SGLT2|Sulfonylurea/)).toHaveCount(0); // patients never see options

  await as(page, "clin-1");
  await page.goto("/clinician/patients/DM-042");
  await expect(page.getByRole("heading", { name: /Potential options to consider/ })).toBeVisible();
  await expect(page.getByText("No confident personalised ranking", { exact: true })).toBeVisible();
  await expect(page.getByRole("article", { name: /Biguanide/ })).toBeVisible();
  await expect(page.getByText("Illustrative content — pending clinical review").first()).toBeVisible();
  await page.getByRole("article", { name: /Biguanide/ }).getByText(/Evidence drawer/).click();
  await expect(page.getByText("ada-soc-2026").first()).toBeVisible();
  await expect(page.getByText("No actionable PGx conclusion").first()).toBeVisible();
});

test("scene 3 — clinician signs a follow-up request; patient sees only the approved action", async ({ page }) => {
  await as(page, "clin-1");
  await page.goto("/clinician/patients/DM-042");
  await page.getByLabel("Action").selectOption("request_more_data");
  await page.getByLabel(/What should the patient do/).fill("Please upload your latest kidney blood test result.");
  await page.getByLabel(/Rationale \(required/).fill("Renal function is unverified; need updated labs.");
  await page.getByRole("button", { name: "Sign decision" }).click();
  await expect(page.getByText(/New plan version v\d+ created/)).toBeVisible();

  await as(page, "u-patient-dm042");
  await page.goto("/patient/plan");
  await expect(page.getByText("Please upload your latest kidney blood test result.")).toBeVisible();
  await expect(page.getByText(/SGLT2 inhibitor class|GLP-1 receptor agonist class|Sulfonylurea class|Eligible for review|Requires manual review/)).toHaveCount(0);
});

test("scene 4 — DEP-017 self-harm fixture: escalation, ranking blocked, alert not falsely acknowledged", async ({ page }) => {
  await as(page, "u-patient-dep017");
  await page.goto("/patient/checkin");
  await page.getByRole("group", { name: /harming yourself or ending your life/ }).getByLabel("Yes").check();
  await page.getByRole("button", { name: "Submit check-in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /emergency/i }).first()).toBeVisible();
  await expect(page.getByText("URGENT").first()).toBeVisible();
  await expect(page.getByText(/not yet acknowledged/i).first()).toBeVisible();
  await expect(page.getByText(/NOT monitored 24\/7/).first()).toBeVisible();

  await as(page, "clin-1");
  await page.goto("/clinician");
  await expect(page.getByRole("heading", { name: /Urgent — open alerts/ })).toBeVisible();
  await page.goto("/clinician/patients/DEP-017");
  await expect(page.getByText(/Option comparison blocked/)).toBeVisible();
  await expect(page.getByText(/OPEN, not acknowledged/).first()).toBeVisible();
  await page.getByLabel("Action").selectOption("mark_alert_reviewed");
  await page.getByLabel(/Rationale \(required/).fill("Contacted the patient directly; crisis pathway engaged.");
  await page.getByRole("button", { name: "Sign decision" }).click();
  await expect(page.getByText("Signed.")).toBeVisible();
  await page.reload();
  await expect(page.getByText(/OPEN, not acknowledged/)).toHaveCount(0);
});

test("scene 5 — research: consent-gated cohort, suppression, hypothesis disposition, no route into care", async ({ page, request }) => {
  await as(page, "u-researcher");
  await page.goto("/research");
  await expect(page.getByText(/Confounding by indication/).first()).toBeVisible();
  await page.getByRole("button", { name: "Run cohort" }).click();
  await expect(page.getByText("Subgroup response (descriptive)")).toBeVisible();
  await expect(page.getByText("<10").first()).toBeVisible();
  await page.getByLabel("Cohort name").fill("T2D baseline severity");
  await page.getByRole("button", { name: "Save definition" }).click();
  await expect(page.getByText(/Saved reproducible definition/)).toBeVisible();
  await page.getByRole("tab", { name: /Hypothesis queue/ }).click();
  await page.getByRole("button", { name: "Scan saved cohort for signals" }).click();
  await expect(page.getByText("Demonstration-only; not evidence of efficacy.").first()).toBeVisible();
  await expect(page.getByText("Caveats checklist").first()).toBeVisible();
  await page.getByRole("button", { name: "Request scientific review" }).first().click();
  await expect(page.getByText("Scientific review requested").first()).toBeVisible();
  await expect(page.getByText(/Nothing is routed to clinical care/).first()).toBeVisible();

  // researcher cannot reach patient data (UI and API)
  await page.goto("/clinician/patients/DM-042");
  await expect(page.getByText("403 — Access denied")).toBeVisible();
  const res = await page.request.get("/api/patients/DM-042");
  expect(res.status()).toBe(403);
  expect(await res.text()).not.toMatch(/DM-042|profile/);
  void request;
});

test("scene 6 — trial pre-screen, module portability and KPIs", async ({ page }) => {
  await as(page, "u-researcher");
  await page.goto("/research");
  await page.getByRole("tab", { name: /Trial pre-screen/ }).click();
  await page.getByRole("button", { name: /Load consented pseudonymous records/ }).click();
  await page.getByRole("button", { name: "Pre-screen" }).click();
  await expect(page.getByText(/snapshot/i).first()).toBeVisible();
  await expect(page.getByText(/Eligibility must be confirmed by the trial team/).first()).toBeVisible();

  await as(page, "u-admin");
  await page.goto("/admin");
  await page.getByRole("button", { name: /Invalid: no signed reviewer/ }).click();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.getByText("Rejected — cannot be activated")).toBeVisible();
  await page.getByRole("button", { name: /Valid 4th module/ }).click();
  await page.getByRole("button", { name: "Validate + activate" }).click();
  await expect(page.getByText(/No code was changed/)).toBeVisible();
  await page.goto("/admin/metrics");
  await expect(page.getByText("Critical test recall")).toBeVisible();
  await expect(page.getByText("✗ Below target")).toHaveCount(0);
  await page.goto("/admin/audit");
  await expect(page.getByRole("cell", { name: "decision.signed" }).first()).toBeVisible();
});
