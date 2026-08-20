// The form is one cue per line (a plain textarea, not a dynamic list UI);
// exercises.cues_ar/cues_en are text[] — this is the one place that shape
// changes, so both createExerciseAction and updateExerciseAction go through
// it rather than each re-deriving the split/trim/filter rules.
export function linesToArray(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : undefined;
}
