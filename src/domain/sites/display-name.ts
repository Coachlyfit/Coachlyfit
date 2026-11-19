/** "Sara Mahmoud" → "Sara M.", "سارة محمود" → "سارة م.". One word stays as is.
 * Mirrors the SQL in submit_review(): first name as typed, initial from the
 * last word of the client's name. */
export function toDisplayName(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0];
  const last = words[words.length - 1];
  // Array.from keeps a surrogate pair (or letter + combining mark start)
  // whole, unlike last[0].
  const initial = Array.from(last)[0].toLocaleUpperCase();
  return `${words[0]} ${initial}.`;
}

/** First letter for an avatar tile. */
export function initialOf(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "";
}
