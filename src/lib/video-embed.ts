// Converts a YouTube/Vimeo watch URL into its embeddable iframe src.
// Returns null for anything else so callers can fall back to a plain link
// instead of embedding an arbitrary URL in an <iframe>.
export function toEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);

    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/")) {
        const id = u.pathname.split("/").pop();
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }

    return null;
  } catch {
    return null;
  }
}

export type ExerciseMedia = { kind: "image" | "embed" | "link"; src: string };

const IMAGE_EXTENSIONS = /\.(gif|png|jpe?g|webp|avif)$/i;

/** Classifies an exercise's `video_url` into what the card should render.
 * The openGym seed (scripts/seed-exercises-opengym.mts) puts a raw GIF URL
 * in this column for every one of its 1,324 rows — toEmbedUrl alone would
 * treat all of them as "link", so the `.gif` branch below is what actually
 * puts media on the card instead of a text link. */
export function resolveExerciseMedia(url: string | null | undefined): ExerciseMedia | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Coach-supplied string ending up in an <img>/<iframe> src — only ever
  // follow it if it's actually a web address.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const embedUrl = toEmbedUrl(url);
  if (embedUrl) return { kind: "embed", src: embedUrl };

  if (IMAGE_EXTENSIONS.test(parsed.pathname)) return { kind: "image", src: url };

  return { kind: "link", src: url };
}
