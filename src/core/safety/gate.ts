import type { SafetyState } from "../types";

/** URGENT or UNABLE_TO_ASSESS blocks option comparison entirely. */
export function comparisonBlocked(state: SafetyState | null | undefined): boolean {
  return state !== "ROUTINE" && state !== "PROMPT_REVIEW";
}
