import { getTranslations } from "next-intl/server";
import { Bell, CircleCheck } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatNumber } from "@/lib/format";
import { CoachHomeService } from "@/domain/dashboard/coach-home.service";
import { LATE_AFTER_DAYS } from "@/domain/progress/stats";
import type { AppLocale } from "@/domain/locale";
import { ClientAvatar } from "./client-avatar";

const QUIET_LIMIT = 5;

function mono(chunks: React.ReactNode) {
  return <span className="font-mono tabular-nums">{chunks}</span>;
}

export async function QuietClients({ locale }: { locale: AppLocale }) {
  const t = await getTranslations("dashboard.quiet");
  const supabase = await createClient();
  const clients = await new CoachHomeService(supabase).listQuietClients(new Date(), QUIET_LIMIT);

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col">
        <h2 id="quiet-h" className="text-xl leading-7 font-semibold">
          {t("title")}
        </h2>
        <span className="text-muted-foreground">
          {t.rich("subtitle", { days: formatNumber(LATE_AFTER_DAYS, locale), num: mono })}
        </span>
      </div>

      {clients.length === 0 ? (
        <EmptyState icon={CircleCheck} title={t("empty")} className="py-6" />
      ) : (
        <ul className="flex flex-col gap-4">
          {clients.map((client) => (
            <li key={client.id} className="flex items-center gap-3">
              <ClientAvatar id={client.id} name={client.name} />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{client.name}</span>
                <span className="text-muted-foreground">
                  {client.days == null
                    ? t("never")
                    : t.rich("days", { count: client.days, value: formatNumber(client.days, locale), num: mono })}
                </span>
              </div>
              {/* No reminder action exists yet -- the bell opens the
                  client's message thread so the coach can nudge them there. */}
              <Link
                href={`/messages/${client.id}`}
                className={buttonVariants({ variant: "outline", size: "icon" })}
                aria-label={t("remind", { name: client.name })}
              >
                <Bell className="size-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
