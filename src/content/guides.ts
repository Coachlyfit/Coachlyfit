/** Video walkthroughs shown on /guides. Files live in public/videos/guides as
 * `${id}-${locale}.mp4` with a matching `.jpg` poster; titles and
 * descriptions are in the `guides.items` messages. Ordered as a series. */
export const GUIDES = [
  { id: "add-client", seconds: 29 },
  { id: "check-in-forms", seconds: 35 },
  { id: "exercise-library", seconds: 23 },
  { id: "workout-programs", seconds: 24 },
  { id: "progress", seconds: 23 },
  { id: "billing", seconds: 25 },
] as const;

export type GuideId = (typeof GUIDES)[number]["id"];
