export type PastNote = { checkin_date: string; notes: string | null };
export type SimilarNote = { checkin_date: string; text: string };

// Short function/connector words that would otherwise dominate the overlap
// score between two unrelated notes ("و", "في" appear in nearly everything).
const STOPWORDS = new Set([
  "في", "من", "على", "إلى", "عن", "مع", "ده", "دي", "كان", "كانت",
  "هو", "هي", "أنا", "انا", "بس", "أوي", "اوي", "جدا", "جداً", "و", "أو", "او",
  "لسه", "كده", "شوية", "خالص", "برضو", "بقى", "بقا", "أي", "اي",
]);

function tokenize(text: string): Set<string> {
  const words = text
    .split(/[\s.,!؟،؛:"'()]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
  return new Set(words);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const SIMILARITY_THRESHOLD = 0.2;

/** Flags when a client's current note echoes a complaint from a prior week —
 * a coach skimming ten check-ins a day won't remember that "الركبة بتوجعني"
 * showed up three weeks running. Jaccard token overlap, not an embeddings
 * pipeline: this is a handful of short notes per client, not a corpus, and
 * plain word overlap catches a repeated concern without an external
 * dependency. Ties broken by recency (most recent prior note first). */
export function findSimilarNotes(currentNote: string, priorNotes: PastNote[], max = 2): SimilarNote[] {
  const currentTokens = tokenize(currentNote);
  if (currentTokens.size === 0) return [];

  return priorNotes
    .filter((n): n is PastNote & { notes: string } => !!n.notes)
    .map((n) => ({ checkin_date: n.checkin_date, text: n.notes, score: jaccard(currentTokens, tokenize(n.notes)) }))
    .filter((n) => n.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score || (a.checkin_date < b.checkin_date ? 1 : -1))
    .slice(0, max)
    .map(({ checkin_date, text }) => ({ checkin_date, text }));
}
