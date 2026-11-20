// Result of submit_coaching_application(). Parsed defensively: the RPC returns
// json and the form must degrade to a generic error on anything unexpected.

export type SubmitOutcome =
  | { ok: true; id: string; coachId: string }
  | { ok: false; error: "invalid_input" | "rate_limited" | "not_found" | "failed" };

export function parseSubmitOutcome(raw: unknown): SubmitOutcome {
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const r = raw as Record<string, unknown>;
    if (r.ok === true && typeof r.id === "string" && typeof r.coach_id === "string") {
      return { ok: true, id: r.id, coachId: r.coach_id };
    }
    if (r.error === "invalid_input" || r.error === "rate_limited" || r.error === "not_found") {
      return { ok: false, error: r.error };
    }
  }
  return { ok: false, error: "failed" };
}
