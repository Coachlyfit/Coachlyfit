import { AlertCircle, Check, CheckCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { RenderableMessage } from "@/lib/messages/group-messages";
import { cn } from "@/lib/utils";

export function MessageBubble({
  message,
  locale,
  showMeta,
  onRetry,
}: {
  message: RenderableMessage;
  locale: AppLocale;
  showMeta: boolean;
  onRetry: (tempId: string) => void;
}) {
  const t = useTranslations("inbox");
  const isFailed = message.status === "failed";

  return (
    <div className={cn("flex", message.isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5",
          message.isOwn
            ? cn("rounded-ee-sm bg-sidebar text-sidebar-foreground", isFailed && "opacity-70 outline outline-destructive/50")
            : "rounded-ss-sm border border-border bg-card",
        )}
      >
        <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {message.body}
        </p>
        {showMeta && (
          <div
            className={cn(
              "mt-1 flex items-center gap-1 font-mono text-[9.5px]",
              message.isOwn ? "text-sidebar-foreground/60" : "text-muted-foreground",
            )}
          >
            <span>{formatDate(message.createdAt, locale, { timeStyle: "short", dateStyle: undefined })}</span>
            {message.isOwn && <MessageStatusIcon status={message.status} />}
            {isFailed && message.pendingRef && (
              <button
                type="button"
                onClick={() => onRetry(message.pendingRef!.tempId)}
                className="ms-1 underline decoration-dotted underline-offset-2 hover:text-destructive"
              >
                {t("retry")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MessageStatusIcon({ status }: { status: RenderableMessage["status"] }) {
  if (status === "sending") return <Loader2 className="size-3 animate-spin" aria-hidden="true" />;
  if (status === "failed") return <AlertCircle className="size-3 text-destructive" aria-hidden="true" />;
  if (status === "read") return <CheckCheck className="size-3 text-primary" aria-hidden="true" />;
  if (status === "sent") return <Check className="size-3" aria-hidden="true" />;
  return null;
}
