import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";

export type ThreadMessage = {
  id: string;
  senderRole: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  /** Signed URLs, already resolved by the page. */
  attachments: string[];
};

/** A ticket's conversation, oldest first. The viewer's own side sits at the
 * inline end, the other side at the start. Internal notes only ever reach
 * this component on the admin side (RLS keeps them from a coach), and are
 * drawn apart from the conversation so they can't be mistaken for a reply. */
export function TicketThread({
  messages,
  viewer,
  locale,
  coachName,
}: {
  messages: ThreadMessage[];
  viewer: "coach" | "admin";
  locale: AppLocale;
  /** Admin side: who the coach's messages are from. */
  coachName?: string;
}) {
  const t = useTranslations("support");
  const tAdmin = useTranslations("admin.support");

  function author(message: ThreadMessage) {
    if (message.senderRole === "admin") return t("team");
    return viewer === "coach" ? t("you") : (coachName ?? tAdmin("unknownCoach"));
  }

  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message) => {
        const own = message.senderRole === viewer;
        return (
          <li
            key={message.id}
            className={cn(
              "flex max-w-[min(100%,40rem)] flex-col gap-2 rounded-xl p-3 text-sm ring-1",
              own ? "ms-auto" : "me-auto",
              message.isInternal
                ? "w-full max-w-none bg-warning-tint text-warning-tint-foreground ring-warning-tint-foreground/20"
                : own
                  ? "bg-primary/10 ring-primary/15"
                  : "bg-card ring-foreground/10",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {message.isInternal && (
                <span className="flex items-center gap-1 font-medium text-warning-tint-foreground">
                  <Lock className="size-3" aria-hidden="true" />
                  {tAdmin("internalNote")}
                </span>
              )}
              <span className="font-medium text-foreground">{author(message)}</span>
              <time dateTime={message.createdAt}>
                {formatDate(message.createdAt, locale, { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </div>
            <p className="whitespace-pre-wrap break-words" dir="auto">
              {message.body}
            </p>
            {message.attachments.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {message.attachments.map((url, index) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer" className="block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <img
                        src={url}
                        alt={t("thread.attachmentAlt", { index: index + 1 })}
                        loading="lazy"
                        className="size-24 rounded-md border border-border object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}
