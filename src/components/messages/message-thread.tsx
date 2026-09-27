"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { Database } from "@/lib/supabase/database.types";
import { listThreadAction, sendMessageAction, markThreadReadAction } from "@/domain/messages/messages-actions";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Message = Database["public"]["Tables"]["messages"]["Row"];

// Realtime delivers new messages instantly; polling stays as a fallback for
// missed events (reconnects, dropped sockets) at the same interval
// NotificationBell already uses.
const POLL_INTERVAL_MS = 10_000;

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
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const queryKey = ["messages", clientId];
  const { data: messages = [] } = useQuery({
    queryKey,
    queryFn: () => listThreadAction(clientId),
    refetchInterval: POLL_INTERVAL_MS,
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    markThreadReadAction(clientId);
  }, [clientId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${clientId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `client_id=eq.${clientId}` },
        () => {
          queryClient.invalidateQueries({ queryKey });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function onSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    startTransition(async () => {
      await sendMessageAction(clientId, body);
      queryClient.invalidateQueries({ queryKey });
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("emptyThread")}</p>
        ) : (
          messages.map((message: Message) => {
            const isOwn = message.sender_role === viewerRole;
            return (
              <div key={message.id} className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[78%] rounded-2xl px-3.5 py-2.5",
                    isOwn
                      ? "rounded-ee-sm bg-sidebar text-sidebar-foreground"
                      : "rounded-ss-sm border border-border bg-card"
                  )}
                >
                  <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{message.body}</p>
                  <p
                    className={cn(
                      "mt-1 font-mono text-[9.5px]",
                      isOwn ? "text-sidebar-foreground/60" : "text-muted-foreground"
                    )}
                  >
                    {formatDate(message.created_at, locale, { timeStyle: "short", dateStyle: undefined })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
      {/* me-14 clears FeedbackWidget's fixed bottom-end corner button
          ((coach)/layout.tsx) -- without it the widget's circle sits
          directly on top of Send since this panel's composer runs flush to
          the same corner. Only the coach layout mounts that widget, so the
          client side (viewerRole === "client") doesn't need the clearance. */}
      <div className={cn("flex items-center gap-2", viewerRole === "coach" && "me-14")}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={t("placeholder")}
          className="h-11 flex-1 rounded-full border border-border bg-card px-4 text-base outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
        />
        <Button
          size="icon"
          className="size-11 shrink-0 rounded-full"
          disabled={pending || !draft.trim()}
          onClick={onSend}
          aria-label={t("send")}
        >
          <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
