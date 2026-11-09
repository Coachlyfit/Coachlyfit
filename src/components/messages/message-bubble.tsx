import { AlertCircle, Check, CheckCheck, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { RenderableMessage } from "@/lib/messages/group-messages";
import { cn } from "@/lib/utils";
import { VoicePlayer } from "./voice-player";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageAvatar } from "@/components/ui/message";
import { UserAvatar } from "@/components/shared/user-avatar";

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
  const isOwn = message.isOwn;
  // Emoji-only messages render larger so they feel like a quick reaction.
  // Every non-whitespace token must be an emoji grapheme (with optional
  // skin tone / ZWJ sequence).
  const isEmojiOnly = message.body
    .trim()
    .split(/\s+/)
    .every(
      (part) =>
        part.length > 0 &&
        /^\p{Extended_Pictographic}(\ufe0f|\p{Emoji_Modifier})?(\u200d\p{Extended_Pictographic}(\ufe0f|\p{Emoji_Modifier})?)*$/u.test(
          part,
        ),
    );

  // One logical bubble only: `variant` drives the background/text colour on
  // the bubble-content element, so there is never an inner box inside the
  // bubble. `align` flips between RTL and LTR together with the message.
  return (
    <Message align={isOwn ? "end" : "start"} className="w-full min-w-0">
      {!isOwn && message.senderAvatarUrl && (
        <MessageAvatar>
          <UserAvatar
            src={message.senderAvatarUrl}
            name={message.senderRole === "coach" ? t("you") : "client"}
            size="sm"
            userId={message.key}
          />
        </MessageAvatar>
      )}
      <Bubble
        align={isOwn ? "end" : "start"}
        variant={isOwn ? "default" : "muted"}
        className="max-w-[80%] lg:max-w-[min(72%,32.5rem)]"
      >
        <BubbleContent
          render={({ className, ...rest }) => (
            <p
              dir="auto"
              {...rest}
              className={cn(
                className,
                "whitespace-pre-wrap [overflow-wrap:anywhere]",
                !isOwn && "border border-border",
                isEmojiOnly ? "text-lg" : "text-sm leading-relaxed",
              )}
            >
              {message.body}
            </p>
          )}
        />
        {message.voice ? (
          <VoicePlayer voice={message.voice} onDark={isOwn} />
        ) : null}
        <div
          className={cn(
            "flex items-center gap-1 self-end text-[11px]",
            isOwn ? "text-primary-foreground/60" : "text-muted-foreground",
          )}
        >
          <time dateTime={message.createdAt} className="font-mono tabular-nums">
            {formatDate(message.createdAt, locale, { timeStyle: "short", dateStyle: undefined })}
          </time>
          {message.status && (
            <MessageStatus
              status={message.status}
              label={t(`status.${message.status}`)}
              className={isOwn ? "text-primary-foreground/60" : "text-muted-foreground"}
            />
          )}
          {isFailed && message.pendingRef && (
            <button
              type="button"
              onClick={() => onRetry(message.pendingRef!.tempId)}
              className="ms-1 rounded-sm font-medium text-primary-foreground/60 underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none"
            >
              {t("retry")}
            </button>
          )}
        </div>
      </Bubble>
    </Message>
  );
}

/** Tick + its meaning in words. The words are visually hidden below lg
 * (bubbles are narrow there) but always available to assistive tech. */
function MessageStatus({
  status,
  label,
  className,
}: {
  status: NonNullable<RenderableMessage["status"]>;
  label: string;
  className?: string;
}) {
  const Icon = { sending: Loader2, failed: AlertCircle, read: CheckCheck, sent: Check }[status];
  return (
    <span className={cn("flex items-center gap-1", className)}>
      <Icon
        className={cn("size-3.5", status === "sending" && "animate-spin", status === "failed" && "text-destructive", className)}
        aria-hidden="true"
      />
      <span className="sr-only lg:not-sr-only">{label}</span>
    </span>
  );
}
