import { routing } from "@/i18n/routing";

const BASE = "http://safe-next.invalid";

/** Validates a post-auth `next` redirect target. Same-origin, locale-prefixed
 * relative paths only — anything else (absolute URLs, protocol-relative
 * `//host`, backslash tricks, encoded variants, unknown locales) returns null so
 * the caller falls back to the role home. Prevents open redirects. */
export function safeNext(next: string | null | undefined): string | null {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return null;
  if (!next.startsWith("/")) return null;

  // Browsers treat "\" as "/", and control chars/whitespace get stripped during
  // URL parsing, so "/\evil.com" or "/\t/evil.com" would become "//evil.com".
  // Check the raw value and its once-decoded form.
  const candidates = [next];
  try {
    candidates.push(decodeURIComponent(next));
  } catch {
    return null;
  }
  for (const c of candidates) {
    if (c.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(c)) return null;
  }

  let url: URL;
  try {
    url = new URL(next, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;

  const [, first] = url.pathname.split("/");
  if (!(routing.locales as readonly string[]).includes(first)) return null;

  return `${url.pathname}${url.search}`;
}
