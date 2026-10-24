import { describe, expect, it } from "vitest";
import { detectSeriesConflicts, usableObservations, type SeriesPoint } from "@/core/safety/quality";
import { M } from "./helpers";

const pt = (id: string, at: string, value: number, unit: string, excluded = false): SeriesPoint => ({ checkin_id: id, concept: "glucose", value, unit, observed_at: at, verification_status: "unverified", excluded });

describe("T17 series data quality", () => {
  it("flags unit changes and implausible jumps, and excludes suspect points from computation", () => {
    const pts = [pt("a", "2026-10-01", 110, "mg/dL"), pt("b", "2026-10-08", 6.1, "mmol/L"), pt("c", "2026-10-15", 880, "mg/dL"), pt("d", "2026-10-22", 105, "mg/dL")];
    const conflicts = detectSeriesConflicts(M("t2d"), pts);
    expect(conflicts.some((c) => c.checkin_id === "b" && /unit changed/.test(c.reason))).toBe(true);
    expect(conflicts.some((c) => c.checkin_id === "c")).toBe(true);
    const usable = usableObservations(pts, conflicts).map((p) => p.checkin_id);
    expect(usable).not.toContain("b");
    expect(usable).not.toContain("c");
    expect(usable).toContain("a");
  });
  it("clean series has no conflicts", () => {
    expect(detectSeriesConflicts(M("t2d"), [pt("a", "2026-10-01", 110, "mg/dL"), pt("b", "2026-10-08", 120, "mg/dL")])).toHaveLength(0);
  });
});
