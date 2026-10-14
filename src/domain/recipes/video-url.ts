export const VIDEO_PLATFORMS = ["youtube", "instagram", "tiktok", "vimeo"] as const;
export type VideoPlatform = (typeof VIDEO_PLATFORMS)[number];

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SLUG = /^[A-Za-z0-9_-]+$/;

/** Canonical https link for a supported recipe video, or null. Only exact
 * hosts on an allowlist pass (a lookalike such as evil.com/youtube.com
 * doesn't), and every query param except YouTube's `v` is dropped, which
 * also strips utm_*, si, igsh and other tracking params. A missing scheme is
 * assumed https; an explicit http:// is rejected. */
export function normalizeVideoUrl(raw: string): { url: string; platform: VideoPlatform } | null {
  const input = raw.trim();
  if (!input) return null;

  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;

  const host = u.hostname.toLowerCase();
  const parts = u.pathname.split("/").filter(Boolean);

  if (host === "youtu.be") {
    const id = parts[0];
    return id && YOUTUBE_ID.test(id) ? { url: `https://www.youtube.com/watch?v=${id}`, platform: "youtube" } : null;
  }
  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/watch") {
      const id = u.searchParams.get("v");
      return id && YOUTUBE_ID.test(id) ? { url: `https://www.youtube.com/watch?v=${id}`, platform: "youtube" } : null;
    }
    if (parts[0] === "shorts" && parts[1] && YOUTUBE_ID.test(parts[1])) {
      return { url: `https://www.youtube.com/shorts/${parts[1]}`, platform: "youtube" };
    }
    return null;
  }

  if (host === "instagram.com" || host === "www.instagram.com") {
    const [kind, code] = parts;
    if ((kind === "reel" || kind === "reels" || kind === "p") && code && SLUG.test(code)) {
      return { url: `https://www.instagram.com/${kind === "p" ? "p" : "reel"}/${code}/`, platform: "instagram" };
    }
    return null;
  }

  if (host === "tiktok.com" || host === "www.tiktok.com" || host === "m.tiktok.com") {
    const [user, kind, id] = parts;
    if (user?.startsWith("@") && kind === "video" && id && /^\d+$/.test(id)) {
      return { url: `https://www.tiktok.com/${user}/video/${id}`, platform: "tiktok" };
    }
    return null;
  }
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const code = parts[0];
    return code && SLUG.test(code) ? { url: `https://${host}/${code}/`, platform: "tiktok" } : null;
  }

  if (host === "vimeo.com" || host === "www.vimeo.com" || host === "player.vimeo.com") {
    const ids = host === "player.vimeo.com" && parts[0] === "video" ? parts.slice(1) : parts;
    const [id, hash] = ids;
    if (!id || !/^\d+$/.test(id)) return null;
    // Unlisted videos carry a hash segment that is part of the address.
    return { url: `https://vimeo.com/${id}${hash && SLUG.test(hash) ? `/${hash}` : ""}`, platform: "vimeo" };
  }

  return null;
}
