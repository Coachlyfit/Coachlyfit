"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageCircle, Loader2 } from "lucide-react";
import type { AppLocale } from "@/domain/locale";
import { groupMessages } from "@/lib/messages/group-messages";
import { cn } from "@/lib/utils";
import { useMessageThread } from "./use-message-thread";
import { usePresence } from "./use-presence";
import { useTyping } from "./use-typing";
import { useScrollAnchor } from "./use-scroll-anchor";
import { DateSeparator } from "./date-separator";
import { MessageGroup } from "./message-group";
import { TypingIndicator } from "./typing-indicator";
import { PresenceBadge } from "./presence-badge";
import { ScrollToBottomPill } from "./scroll-to-bottom-pill";
import { MessageComposer } from "./message-composer";

export function MessageThread({
  clientId,
  viewerRole,
  locale,
  header,
  quickReplies,
  className,
}: {
  clientId: string;
  viewerRole: "coach" | "client";
  locale: AppLocale;
  /** Replaces the default presence line (the coach view has its own header
   * with the client's name and last-seen). */
  header?: React.ReactNode;
  quickReplies?: string[];
  className?: string;
}) {
  const t = useTranslations("inbox");
  const containerRef = useRef<HTMLDivElement>(null);
  const topSentinelRef = useRef<HTMLDivElement>(null);

  const { renderable, isLoading, send, sendVoice, retry, hasOlder, isLoadingOlder, loadOlder } = useMessageThread(
    clientId,
    viewerRole,
  );
  const { otherOnline, lastSeenAt, channel } = usePresence(clientId, viewerRole);
  const { otherTyping, notifyTyping, notifyStopped } = useTyping(channel, viewerRole);

  const items = groupMessages(renderable);
  const { isAtBottom, newMessageCount, scrollToBottom, onScroll, notifyOwnMessage, captureBeforePrepend } =
    useScrollAnchor(containerRef, renderable[0]?.key ?? null, renderable.at(-1)?.key ?? null);

  // Older pages load when the top of the list scrolls into view.
  useEffect(() => {
    const root = containerRef.current;
    const sentinel = topSentinelRef.current;
    if (!root || !sentinel || !hasOlder || isLoadingOlder) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        captureBeforePrepend();
        loadOlder();
      },
      { root, rootMargin: "120px 0px 0px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasOlder, isLoadingOlder, loadOlder, captureBeforePrepend]);

  function handleSend(body: string) {
    notifyOwnMessage();
    send(body);
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-background", className)}>
      {header ?? (
        <div className="border-b border-border bg-card px-4 py-2">
          <PresenceBadge online={otherOnline} lastSeenAt={lastSeenAt} locale={locale} />
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={containerRef}
          onScroll={onScroll}
          className="flex h-full flex-col gap-1.5 overflow-y-auto overscroll-contain px-3 py-4 lg:px-6"
        >
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center" role="status" aria-label={t("loading")}>
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={MessageCircle} title={t("emptyThread")} className="flex-1 justify-center" />
          ) : (
            <>
              <div ref={topSentinelRef} className="flex h-5 shrink-0 items-center justify-center">
                {isLoadingOlder && (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("loadingOlder")} />
                )}
              </div>
              {items.map((item) =>
                item.kind === "date-separator" ? (
                  <DateSeparator key={item.key} date={item.date} locale={locale} />
                ) : (
                  <MessageGroup key={item.key} group={item} locale={locale} onRetry={retry} />
                ),
              )}
            </>
          )}
        </div>
        <ScrollToBottomPill show={!isAtBottom && newMessageCount > 0} count={newMessageCount} onClick={() => scrollToBottom()} />
      </div>

      <div className="border-t border-border bg-card px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:px-4">
        <TypingIndicator show={otherTyping} />
        <MessageComposer
          quickReplies={quickReplies}
          onSend={handleSend}
          onSendVoice={(recording) => {
            notifyOwnMessage();
            sendVoice(recording);
          }}
          onTyping={notifyTyping}
          onStopTyping={notifyStopped}
        />
      </div>
    </div>
  );
}
