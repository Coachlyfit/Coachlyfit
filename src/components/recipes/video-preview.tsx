"use client";

import { useTranslations } from "next-intl";
import { ExternalLink, PlayCircle } from "lucide-react";
import { normalizeVideoUrl } from "@/domain/recipes/video-url";
import { toEmbedUrl } from "@/lib/video-embed";

/** A supported recipe video: YouTube embeds (privacy-enhanced domain, lazy
 * iframe); Instagram, TikTok and Vimeo links open in their app or a new tab.
 * Shared by the coach form and the client's recipe sheet. */
export function VideoPreview({ url }: { url: string }) {
  const t = useTranslations("recipes");
  const video = normalizeVideoUrl(url);
  if (!video) return null;

  const embed = video.platform === "youtube" ? toEmbedUrl(video.url) : null;
  if (embed) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg border bg-black">
        <iframe
          src={embed}
          title={t("form.videoPreview")}
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="size-full"
        />
      </div>
    );
  }

  const platform = t(`platforms.${video.platform}`);
  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <PlayCircle className="size-8 shrink-0 text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{t("form.openVideo", { platform })}</span>
        <span className="block truncate text-xs text-muted-foreground" dir="ltr">
          {video.url}
        </span>
      </span>
      <ExternalLink className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" aria-hidden="true" />
    </a>
  );
}
