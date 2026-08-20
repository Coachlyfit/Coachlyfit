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
