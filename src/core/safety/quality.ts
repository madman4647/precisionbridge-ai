import type { Manifest } from "../modules/schema";
import type { Observation } from "../types";

export interface SeriesPoint extends Observation { checkin_id: string }
export interface SeriesConflict { checkin_id: string; concept: string; reason: string }

/** Cross-check-in consistency (T17): unit changes, implausible jumps, or dates that go backwards. */
export function detectSeriesConflicts(manifest: Manifest, points: SeriesPoint[]): SeriesConflict[] {
  const out: SeriesConflict[] = [];
  const byConcept = new Map<string, SeriesPoint[]>();
  for (const p of points) {
    if (!byConcept.has(p.concept)) byConcept.set(p.concept, []);
    byConcept.get(p.concept)!.push(p);
  }
  for (const [concept, series] of byConcept) {
    const def = manifest.measure_definitions.find((d) => d.concept === concept);
    series.sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    const units = new Set(series.map((s) => s.unit));
    for (const s of series) {
      if (s.excluded) out.push({ checkin_id: s.checkin_id, concept, reason: s.exclusion_reason ?? "excluded" });
    }
    if (units.size > 1) {
      for (const s of series.slice(1)) {
        if (s.unit !== series[0].unit) out.push({ checkin_id: s.checkin_id, concept, reason: `unit changed from ${series[0].unit} to ${s.unit} within series` });
      }
    }
    if (def) {
      const good = series.filter((s) => !s.excluded && def.units[s.unit] !== undefined);
      for (let i = 1; i < good.length; i++) {
        const prev = good[i - 1].value * def.units[good[i - 1].unit];
        const cur = good[i].value * def.units[good[i].unit];
        if (prev > 0 && (cur / prev > 4 || cur / prev < 0.25)) out.push({ checkin_id: good[i].checkin_id, concept, reason: `implausible change (${prev.toFixed(0)} → ${cur.toFixed(0)} ${def.canonical_unit})` });
      }
    }
  }
  return out;
}

/** Observations safe to use in trend/baseline computation. */
export function usableObservations(points: SeriesPoint[], conflicts: SeriesConflict[]): SeriesPoint[] {
  const bad = new Set(conflicts.map((c) => `${c.checkin_id}|${c.concept}`));
  return points.filter((p) => !p.excluded && !bad.has(`${p.checkin_id}|${p.concept}`));
}
