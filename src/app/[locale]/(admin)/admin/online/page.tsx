import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { PresenceService } from "@/domain/presence/presence.service";
import type { AppLocale } from "@/domain/locale";
import { OnlineUsers } from "./online-users";

// pageSize generous enough to cover a platform's full roster in one RPC
// call (matches admin_list_coaches(), which is also unpaginated at the DB
// level) -- OnlineUsers then groups/searches/paginates client-side, same
// pattern as CoachesTable.
const FETCH_SIZE = 1000;

export default async function AdminOnlinePage({ params }: { params: Promise<{ locale: AppLocale }> }) {
  const { locale } = await params;
  const t = await getTranslations("admin.online");
  const supabase = await createClient();

  const { rows, total, online } = await new PresenceService(supabase).list({ pageSize: FETCH_SIZE });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("online")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums text-success">{online}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">{t("total")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{total}</p>
          </CardContent>
        </Card>
      </div>

      <OnlineUsers locale={locale} rows={rows} />
    </div>
  );
}
