import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { authorize, can } from "@/core/rbac";

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

describe("architecture invariants", () => {
  it("core code has no disease-specific branching and no Next.js imports", () => {
    const files = walk(path.resolve(__dirname, "../../src/core")).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/module(_id|Id)?\s*[=!]==?\s*["'](depression|hypertension|t2d)["']/);
      expect(src, f).not.toMatch(/["'](depression|hypertension|t2d)["']\s*===/);
      expect(src, f).not.toMatch(/from ["']next/);
      expect(src, f).not.toMatch(/\beval\s*\(|new Function\(/);
    }
  });
});

describe("RBAC matrix", () => {
  it("researchers have no patient access; only clinicians sign decisions", () => {
    expect(authorize({ id: "r", role: "researcher", display_name: "r" }, "patient.read", { patient_id: "DM-042" }).ok).toBe(false);
    expect(can("patient", "decision.sign")).toBe(false);
    expect(can("researcher", "decision.sign")).toBe(false);
    expect(can("safety_admin", "decision.sign")).toBe(false);
    expect(can("clinician", "decision.sign")).toBe(true);
    expect(can("patient", "comparison.read")).toBe(false);
  });
  it("patients see only themselves; clinicians only assigned patients", () => {
    const pat = { id: "u", role: "patient" as const, display_name: "p", patient_id: "DM-042" };
    expect(authorize(pat, "patient.read", { patient_id: "DM-042" }).ok).toBe(true);
    expect(authorize(pat, "patient.read", { patient_id: "DEP-017" }).ok).toBe(false);
    const clin = { id: "c", role: "clinician" as const, display_name: "c" };
    expect(authorize(clin, "patient.read", { patient_id: "DM-042", assigned: true }).ok).toBe(true);
    expect(authorize(clin, "patient.read", { patient_id: "DM-042", assigned: false }).ok).toBe(false);
    expect(authorize(null, "patient.read").ok).toBe(false);
  });
});
