/** Pre-approved, non-LLM fallback copy. Emergency copy is controlled by the safety/admin reviewer (view-only in demo). */
export const EMERGENCY_COPY = {
  version: "emergency-copy/1.0.0-illustrative",
  jurisdiction: "Illustrative (not location-verified)",
  headline: "If you are in immediate danger, or think you might act on thoughts of harming yourself, call your local emergency number now or go to the nearest emergency department.",
  body: "Contact a trusted person to stay with you. If you are in the UK or Ireland you can call Samaritans on 116 123; in the US you can call or text 988; elsewhere, search for your national crisis line or ask emergency services.",
  notice: "A clinician alert has been recorded for review. This demo is NOT monitored 24/7 and nobody has been dispatched. Do not wait for a reply.",
  status: "Illustrative content — pending clinical review",
};

export const DEFAULT_PATIENT_MESSAGES: Record<string, string> = {
  routine: "Thank you — your check-in has been recorded. No warning rule was triggered. This does not rule out illness: if you feel worse or are worried, contact your care team. Your clinician will review your information.",
  prompt_review: "Thank you — your check-in has been recorded and flagged for timely clinician review. No medication changes will be made unless your clinician signs a plan. If you feel unsafe or much worse, contact your care team or local emergency services.",
  unable_to_assess: "We could not fully assess this check-in (information was missing, conflicting, or a system check did not finish). It has been sent for clinician review. Please do not treat this as reassurance. If you feel unwell or worried, contact your care team or local emergency services.",
  free_text_review: "Something you wrote has been flagged for clinician review.",
};

export function messagesFor(manifestMessages: Record<string, string>, ids: string[]): string[] {
  const all = { ...DEFAULT_PATIENT_MESSAGES, ...manifestMessages };
  return ids.map((i) => all[i]).filter(Boolean);
}
