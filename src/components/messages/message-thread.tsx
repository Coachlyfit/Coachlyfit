"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageCircle, Loader2 } from "lucide-react";
import type { AppLocale } from "@/domain/locale";
import { groupMessages } from "@/lib/messages/group-messages";
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
}: {
  clientId: string;
  viewerRole: "coach" | "client";
  locale: AppLocale;
}) {
  const t = useTranslations("inbox");
  const containerRef = useRef<HTMLDivElement>(null);

  const { renderable, isLoading, send, retry } = useMessageThread(clientId, viewerRole);
  const { otherOnline, lastSeenAt, channel } = usePresence(clientId, viewerRole);
  const { otherTyping, notifyTyping, notifyStopped } = useTyping(channel, viewerRole);

  const items = groupMessages(renderable);
  const { isAtBottom, newMessageCount, scrollToBottom, onScroll, notifyOwnMessage } = useScrollAnchor(
    containerRef,
    renderable.length,
  );

  function handleSend(body: string) {
    notifyOwnMessage();
    send(body);
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PresenceBadge online={otherOnline} lastSeenAt={lastSeenAt} locale={locale} />

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} onScroll={onScroll} className="flex h-full flex-col gap-3 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={MessageCircle} title={t("emptyThread")} className="flex-1 justify-center" />
          ) : (
            items.map((item) =>
              item.kind === "date-separator" ? (
                <DateSeparator key={item.key} date={item.date} locale={locale} />
              ) : (
                <MessageGroup key={item.key} group={item} locale={locale} onRetry={retry} />
              ),
            )
          )}
        </div>
        <ScrollToBottomPill show={!isAtBottom && newMessageCount > 0} count={newMessageCount} onClick={() => scrollToBottom()} />
      </div>

      <TypingIndicator show={otherTyping} />

      <MessageComposer viewerRole={viewerRole} onSend={handleSend} onTyping={notifyTyping} onStopTyping={notifyStopped} />
    </div>
  );
}
