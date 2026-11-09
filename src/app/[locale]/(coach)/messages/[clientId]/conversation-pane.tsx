"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight, User } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MessageThread } from "@/components/messages/message-thread";
import { useClientPresence } from "@/components/messages/use-inbox-threads";
import { usePersistedFlag } from "@/components/messages/use-persisted-flag";
import { Link } from "@/i18n/navigation";
import { formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { QUICK_REPLY_KEYS } from "@/domain/messages/quick-replies";
import { ClientContextPanel, type ConversationClient } from "./client-context-panel";
import { AVATARS_BUCKET } from "@/domain/avatars/avatar.service";
import { createClient } from "@/lib/supabase/client";
import { UserAvatar } from "@/components/shared/user-avatar";

const PANEL_STORAGE_KEY = "messages:context-panel";

/** The open conversation: header, thread, and the client panel beside it.
 * Below lg it covers the whole screen (above the app's top bar and bottom
 * nav) so the chat gets the full height and the composer sits at the
 * bottom edge. */
export function ConversationPane({
  locale,
  client,
  viewerAvatarUrl,
  checkinTemplateVersionId,
}: {
  locale: AppLocale;
  client: ConversationClient;
  /** Public avatar URL of the coach viewing this thread. */
  viewerAvatarUrl: string | null;
  checkinTemplateVersionId: string | null;
}) {
  const t = useTranslations("inbox");
  const presence = useClientPresence()[client.id];
  // xl and up: an inline column the coach can collapse, remembered across
  // visits. lg to xl has no room for a third column, so the same content
  // opens in a sheet instead. Two buttons, each shown at its own breakpoint,
  // rather than one handler that measures the viewport.
  const [panelOpen, setPanelOpen] = usePersistedFlag(PANEL_STORAGE_KEY, true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const statusLabel = presence?.online
    ? t("online")
    : presence?.lastSeenAt
      ? t("lastSeen", { time: formatRelativeTime(presence.lastSeenAt, locale) })
      : t("offline");

  const clientAvatarUrl = client.avatar_url
    ? createClient().storage.from(AVATARS_BUCKET).getPublicUrl(client.avatar_url).data.publicUrl
    : null;

  const panel = (
    <ClientContextPanel locale={locale} client={client} checkinTemplateVersionId={checkinTemplateVersionId} />
  );

  const header = (
    <header className="flex items-center gap-2 border-b border-border bg-card px-2 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] lg:gap-3 lg:px-4 lg:py-3">
      <Link
        href="/messages"
        aria-label={t("header.back")}
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "lg:hidden")}
      >
        {/* Points toward inline-start: right in RTL as drawn, mirrored for LTR. */}
        <ChevronRight className="size-5 ltr:-scale-x-100" aria-hidden="true" />
      </Link>
      <UserAvatar
        src={clientAvatarUrl}
        name={client.name}
        userId={client.id}
        size="lg"
        className="shrink-0"
      />
      <div className="flex min-w-0 flex-1 flex-col leading-tight">
        <h2 className="truncate font-semibold">{client.name}</h2>
        <span
          // Relative to "now" in the viewer's clock; the server render can differ.
          suppressHydrationWarning
          className={cn("truncate text-[13px]", presence?.online ? "text-success-tint-foreground" : "text-muted-foreground")}
        >
          {statusLabel}
        </span>
      </div>

      <Link
        href={`/clients/${client.id}`}
        aria-label={t("header.clientFile")}
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "lg:hidden")}
      >
        <User className="size-5" aria-hidden="true" />
      </Link>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="hidden lg:inline-flex xl:hidden"
        aria-haspopup="dialog"
        onClick={() => setSheetOpen(true)}
      >
        {t("header.clientFile")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("hidden xl:inline-flex", panelOpen && "bg-muted")}
        aria-pressed={panelOpen}
        onClick={() => setPanelOpen(!panelOpen)}
      >
        {t("header.clientFile")}
      </Button>
    </header>
  );

  return (
    <div className="fixed inset-0 z-50 flex bg-background lg:static lg:z-auto lg:h-full">
      <MessageThread
        clientId={client.id}
        viewerRole="coach"
        locale={locale}
        header={header}
        viewerAvatarUrl={viewerAvatarUrl}
        otherAvatarUrl={clientAvatarUrl}
        quickReplies={QUICK_REPLY_KEYS.map((key) => t(`quickReplies.${key}`))}
        className="min-w-0 flex-1"
      />

      {panelOpen && (
        <aside
          aria-label={t("header.clientFile")}
          className="hidden w-70 shrink-0 overflow-y-auto border-s border-border bg-card px-4 py-5 xl:block"
        >
          {panel}
        </aside>
      )}

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        {/* The vendored sheet only knows physical sides; inline-end is left in RTL. */}
        <SheetContent side={locale === "ar" ? "left" : "right"}>
          <SheetHeader>
            <SheetTitle>{t("header.clientFile")}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4">{panel}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
