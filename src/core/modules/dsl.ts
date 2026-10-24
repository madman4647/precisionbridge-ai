import { z } from "zod";

/**
 * Small, safe condition DSL. Pure data; evaluated by `evalCond` (no eval / Function).
 * Paths: answers.<id> | obs.<concept> | derived.<id> | profile.<key>
 */
export type Cond =
  | { op: "cmp"; field: string; cmp: "gt" | "gte" | "lt" | "lte" | "eq" | "neq"; value: number | string | boolean }
  | { op: "in"; field: string; values: (number | string | boolean)[] }
  | { op: "includes"; field: string; value: string }
  | { op: "missing"; field: string }
  | { op: "present"; field: string }
  | { op: "and"; all: Cond[] }
  | { op: "or"; any: Cond[] }
  | { op: "not"; cond: Cond };

export const FIELD_PATH = /^(answers|obs|derived|profile)\.[A-Za-z0-9_]+$/;
const prim = z.union([z.number(), z.string(), z.boolean()]);

export const CondSchema: z.ZodType<Cond> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("cmp"), field: z.string().regex(FIELD_PATH), cmp: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]), value: prim }),
    z.object({ op: z.literal("in"), field: z.string().regex(FIELD_PATH), values: z.array(prim).min(1) }),
    z.object({ op: z.literal("includes"), field: z.string().regex(FIELD_PATH), value: z.string() }),
    z.object({ op: z.literal("missing"), field: z.string().regex(FIELD_PATH) }),
    z.object({ op: z.literal("present"), field: z.string().regex(FIELD_PATH) }),
    z.object({ op: z.literal("and"), all: z.array(CondSchema).min(1) }),
    z.object({ op: z.literal("or"), any: z.array(CondSchema).min(1) }),
    z.object({ op: z.literal("not"), cond: CondSchema }),
  ]),
) as z.ZodType<Cond>;

export function condDepth(c: Cond): number {
  switch (c.op) {
    case "and": return 1 + Math.max(...c.all.map(condDepth));
    case "or": return 1 + Math.max(...c.any.map(condDepth));
    case "not": return 1 + condDepth(c.cond);
    default: return 1;
  }
}

export function condFields(c: Cond, out: string[] = []): string[] {
  switch (c.op) {
    case "and": c.all.forEach((x) => condFields(x, out)); break;
    case "or": c.any.forEach((x) => condFields(x, out)); break;
    case "not": condFields(c.cond, out); break;
    default: out.push(c.field);
  }
  return out;
}

export type Tri = "true" | "false" | "unknown";
export interface Resolved {
  value: unknown; // null/undefined => missing
  verified: boolean;
}
export type Resolver = (path: string) => Resolved;

export interface EvalResult {
  result: Tri;
  /** Fields that were read to reach the result, with whether each non-null one was verified. */
  touched: { path: string; present: boolean; verified: boolean }[];
}

/** Kleene three-valued evaluation: comparisons on missing data are "unknown", never silently false-as-normal. */
export function evalCond(c: Cond, resolve: Resolver): EvalResult {
  const touched: EvalResult["touched"] = [];
  const visit = (n: Cond): Tri => {
    switch (n.op) {
      case "and": {
        const rs = n.all.map(visit);
        if (rs.includes("false")) return "false";
        return rs.includes("unknown") ? "unknown" : "true";
      }
      case "or": {
        const rs = n.any.map(visit);
        if (rs.includes("true")) return "true";
        return rs.includes("unknown") ? "unknown" : "false";
      }
      case "not": {
        const r = visit(n.cond);
        return r === "unknown" ? "unknown" : r === "true" ? "false" : "true";
      }
      default: {
        const r = resolve(n.field);
        const present = r.value !== null && r.value !== undefined;
        touched.push({ path: n.field, present, verified: r.verified });
        if (n.op === "missing") return present ? "false" : "true";
        if (n.op === "present") return present ? "true" : "false";
        if (!present) return "unknown";
        const v = r.value;
        if (n.op === "includes") return Array.isArray(v) ? (v.includes(n.value) ? "true" : "false") : "false";
        if (n.op === "in") return n.values.includes(v as never) ? "true" : "false";
        // cmp
        if (typeof n.value === "number") {
          const num = typeof v === "number" ? v : Number.NaN;
          if (Number.isNaN(num)) return "unknown";
          const ok = { gt: num > n.value, gte: num >= n.value, lt: num < n.value, lte: num <= n.value, eq: num === n.value, neq: num !== n.value }[n.cmp];
          return ok ? "true" : "false";
        }
        if (n.cmp === "eq") return v === n.value ? "true" : "false";
        if (n.cmp === "neq") return v !== n.value ? "true" : "false";
        return "unknown";
      }
    }
  };
  const result = visit(c);
  return { result, touched };
}
