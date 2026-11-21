export type MealTone = "orange" | "blue" | "purple";

const BY_INDEX: { emoji: string; tone: MealTone }[] = [
  { emoji: "☀️", tone: "orange" },
  { emoji: "🌤️", tone: "blue" },
  { emoji: "🍎", tone: "purple" },
  { emoji: "🌙", tone: "orange" },
];

/** The emoji and tint on a meal card. By the meal's scheduled time when it
 * has one (morning / midday / afternoon / evening), else by its position. */
export function mealVisual(time: string | null, index: number): { emoji: string; tone: MealTone } {
  const hour = time ? Number(time.slice(0, 2)) : NaN;
  if (Number.isNaN(hour)) return BY_INDEX[index % BY_INDEX.length];
  if (hour < 11) return BY_INDEX[0];
  if (hour < 15) return BY_INDEX[1];
  if (hour < 19) return BY_INDEX[2];
  return BY_INDEX[3];
}
