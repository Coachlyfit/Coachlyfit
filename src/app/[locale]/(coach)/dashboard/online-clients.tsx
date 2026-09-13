import { getTranslations } from "next-intl/server";
import { Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeTime } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import type { OnlineUserRow } from "@/domain/presence/presence.service";

export async function OnlineClients({ locale, clients }: { locale: AppLocale; clients: OnlineUserRow[] }) {
  const t = await getTranslations("dashboard.online");

  return (
    <Card className="overflow-hidden py-0">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <span className="text-sm font-semibold">{t("title")}</span>
      </div>
      {clients.length === 0 ? (
        <EmptyState icon={Radio} title={t("empty")} className="py-8" />
      ) : (
        <div className="flex flex-col">
          {clients.map((client) => (
            <div key={client.userId} className="flex items-center gap-3 border-b border-border/60 px-5 py-3 last:border-0">
              <div className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                {client.name[0] ?? "?"}
                {client.online && (
                  <span className="absolute -end-0.5 -top-0.5 size-2.5 rounded-full border-2 border-card bg-success" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{client.name}</div>
              </div>
              <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                {client.lastSeenAt ? formatRelativeTime(client.lastSeenAt, locale) : t("never")}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
