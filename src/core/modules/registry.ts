import hypertension from "@/modules-data/hypertension.json";
import t2d from "@/modules-data/t2d.json";
import depression from "@/modules-data/depression.json";
import asthma from "@/modules-data/samples/asthma_demo.json";
import invalid from "@/modules-data/samples/invalid_demo.json";
import expired from "@/modules-data/samples/expired_demo.json";
import { validateManifest } from "./validator";
import type { Manifest } from "./schema";

/** Bundled, immutable module releases. Admin console can add more (e.g. the dummy 4th module) via the DB registry. */
export const BUNDLED_MODULE_JSON: unknown[] = [hypertension, t2d, depression];
export const SAMPLE_MODULES = { asthma_demo: asthma, invalid_demo: invalid, expired_demo: expired } as Record<string, unknown>;

export function loadBundled(now = new Date()): Manifest[] {
  return BUNDLED_MODULE_JSON.map((j) => {
    const r = validateManifest(j, now);
    if (!r.ok || !r.manifest) throw new Error(`Bundled module failed validation: ${r.errors.join("; ")}`);
    return r.manifest;
  });
}
