/** Shared vocabulary for the structured coach notes ("observations").
 * Mirrors the check constraints in 20261111000002_structured_observations.sql. */
export const OBSERVATION_CATEGORIES = [
  "general",
  "technique",
  "adherence",
  "nutrition",
  "injury_pain",
  "mental_state",
] as const;
export type ObservationCategory = (typeof OBSERVATION_CATEGORIES)[number];

export const OBSERVATION_SEVERITIES = ["low", "medium", "high"] as const;
export type ObservationSeverity = (typeof OBSERVATION_SEVERITIES)[number];

export const OBSERVATION_LINK_TYPES = ["program", "check_in", "exercise"] as const;
export type ObservationLinkType = (typeof OBSERVATION_LINK_TYPES)[number];

/** Validated note fields as the service stores them (details "" = none). */
export type ObservationFields = {
  title: string;
  category: ObservationCategory;
  severity: ObservationSeverity | null;
  details: string;
  linked: { type: ObservationLinkType; id: string } | null;
  image_path: string | null;
};

export const OBSERVATION_IMAGES_BUCKET = "observation-images";

/** Image paths are `coachId/clientId/<uuid>.<ext>`; the server re-checks the
 * prefix (RLS already blocks a foreign one) and the extension. */
export const OBSERVATION_IMAGE_EXT = new Set(["webp", "jpg", "jpeg", "png"]);

export function observationImagePathOk(path: string, coachId: string, clientId: string): boolean {
  const prefix = `${coachId}/${clientId}/`;
  if (!path.startsWith(prefix)) return false;
  const rest = path.slice(prefix.length);
  const ext = rest.split(".").pop()?.toLowerCase() ?? "";
  return !rest.includes("/") && OBSERVATION_IMAGE_EXT.has(ext);
}
