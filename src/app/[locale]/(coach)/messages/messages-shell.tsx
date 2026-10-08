"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInboxThreads } from "@/components/messages/use-inbox-threads";
import type { AppLocale } from "@/domain/locale";
import type { InboxThread } from "@/domain/messages/messages.service";
import { cn } from "@/lib/utils";
import { BroadcastDialog } from "./broadcast-dialog";
import { ConversationList } from "./conversation-list";
import { NewMessageDialog } from "./new-message-dialog";

/** List + open conversation in one frame. From lg up both columns show;
 * below lg it's one or the other, decided by whether the URL names a client
 * (/messages = list, /messages/[clientId] = that chat, full screen). */
export function MessagesShell({
  locale,
  threads: initialThreads,
  recipientCounts,
  children,
}: {
  locale: AppLocale;
  threads: InboxThread[];
  recipientCounts: { all: number; subscribed: number };
  children: React.ReactNode;
}) {
  const t = useTranslations("inbox");
  const { clientId: selectedId } = useParams<{ clientId?: string }>();
  const threads = useInboxThreads(initialThreads);
  const clients = threads.map((thread) => ({ id: thread.client_id, display_name: thread.display_name }));

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-7.25rem)]">
      <div className={cn("flex flex-wrap items-center justify-end gap-2", selectedId && "max-lg:hidden")}>
        <BroadcastDialog
          counts={recipientCounts}
          trigger={
            <Button type="button" variant="secondary" size="sm">
              <Megaphone className="size-4" aria-hidden="true" />
              {t("broadcast.trigger")}
            </Button>
          }
        />
        <NewMessageDialog
          clients={clients}
          trigger={
            <Button type="button" size="sm" className="max-lg:hidden">
              <Plus className="size-4" aria-hidden="true" />
              {t("compose.trigger")}
            </Button>
          }
        />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <ConversationList
          threads={threads}
          selectedId={selectedId ?? null}
          locale={locale}
          // pb: keeps the last rows clear of the pinned "new conversation" button.
          className={cn("max-lg:pb-20 lg:border-e lg:border-border", selectedId && "max-lg:hidden")}
        />
        <section aria-label={t("conversation")} className={cn("min-h-0 min-w-0", !selectedId && "max-lg:hidden")}>
          {children}
        </section>
      </div>

      {!selectedId && (
        // end-20, not end-4: leaves the corner to the floating feedback button.
        <div className="fixed start-4 end-20 bottom-[calc(var(--bottom-nav-h)+0.5rem)] z-30 lg:hidden">
          <NewMessageDialog
            clients={clients}
            trigger={
              <Button type="button" className="h-12 w-full rounded-xl text-base shadow-lg">
                <Plus className="size-4" aria-hidden="true" />
                {t("compose.trigger")}
              </Button>
            }
          />
        </div>
      )}
    </div>
  );
}
