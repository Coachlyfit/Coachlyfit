import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/dashboard/page-title";
import { Skeleton } from "@/components/ui/skeleton";
import { MessagesService } from "@/domain/messages/messages.service";
import type { AppLocale } from "@/domain/locale";
import { MessagesShell } from "./messages-shell";

// A layout, not a page: the conversation list stays mounted (search text,
// filter, scroll position) while /messages/[clientId] swaps the open thread.
export default async function MessagesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("inbox");

  return (
    <>
      <PageTitle title={t("title")} />
      <Suspense fallback={<MessagesSkeleton />}>
        <MessagesData locale={locale as AppLocale}>{children}</MessagesData>
      </Suspense>
    </>
  );
}

async function MessagesData({ locale, children }: { locale: AppLocale; children: React.ReactNode }) {
  const supabase = await createClient();
  const service = new MessagesService(supabase);
  const [threads, recipients] = await Promise.all([service.listInbox(), service.listBroadcastRecipients(new Date())]);

  return (
    <MessagesShell
      locale={locale}
      threads={threads}
      recipientCounts={{ all: recipients.all.length, subscribed: recipients.subscribed.length }}
    >
      {children}
    </MessagesShell>
  );
}

function MessagesSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-7.25rem)]">
      <div className="flex justify-end gap-2">
        <Skeleton className="h-10 w-40" />
        <Skeleton className="hidden h-10 w-36 lg:block" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card lg:grid lg:grid-cols-[minmax(17rem,22rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-3 p-3 lg:border-e lg:border-border">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-full" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 py-1.5">
              <Skeleton className="size-11 shrink-0 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden bg-background lg:block" />
      </div>
    </div>
  );
}
