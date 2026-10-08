import { AlertCircle, Check, CheckCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { RenderableMessage } from "@/lib/messages/group-messages";
import { cn } from "@/lib/utils";

export function MessageBubble({
  message,
  locale,
  onRetry,
}: {
  message: RenderableMessage;
  locale: AppLocale;
  onRetry: (tempId: string) => void;
}) {
  const t = useTranslations("inbox");
  const isFailed = message.status === "failed";

  return (
    // Own messages sit on the inline-end side, the other party's on
    // inline-start; the squared corner is the bottom one on that same side.
    // All logical, so both flip together between RTL and LTR.
    <div className={cn("flex", message.isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-0.5 rounded-2xl px-3 pt-2 pb-1.5 lg:max-w-[min(72%,32.5rem)]",
          message.isOwn
            ? cn("rounded-ee-sm bg-sidebar text-sidebar-foreground dark:bg-sidebar-accent", isFailed && "outline outline-destructive/60")
            : "rounded-es-sm bg-card ring-1 ring-foreground/10 ring-inset",
        )}
      >
        <p dir="auto" className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{message.body}</p>
        <div
          className={cn(
            "flex items-center gap-1 self-end text-[11px]",
            message.isOwn ? "text-sidebar-foreground/60" : "text-muted-foreground",
          )}
        >
          <time dateTime={message.createdAt} className="font-mono tabular-nums">
            {formatDate(message.createdAt, locale, { timeStyle: "short", dateStyle: undefined })}
          </time>
          {message.status && <MessageStatus status={message.status} label={t(`status.${message.status}`)} />}
          {isFailed && message.pendingRef && (
            <button
              type="button"
              onClick={() => onRetry(message.pendingRef!.tempId)}
              className="ms-1 rounded-sm font-medium text-sidebar-foreground underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            >
              {t("retry")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tick + its meaning in words. The words are visually hidden below lg
 * (bubbles are narrow there) but always available to assistive tech. */
function MessageStatus({ status, label }: { status: NonNullable<RenderableMessage["status"]>; label: string }) {
  const Icon = { sending: Loader2, failed: AlertCircle, read: CheckCheck, sent: Check }[status];
  return (
    <span
      className={cn(
        "flex items-center gap-1",
        // sidebar-ring: the accent that stays legible on the navy bubble in
        // both themes (primary is too dark on it in light mode).
        status === "read" && "text-sidebar-ring",
        status === "failed" && "text-sidebar-foreground",
      )}
    >
      <Icon
        className={cn("size-3.5", status === "sending" && "animate-spin", status === "failed" && "text-destructive")}
        aria-hidden="true"
      />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </span>
  );
}
