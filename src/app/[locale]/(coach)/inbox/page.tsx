import { getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { MessageCircle } from "lucide-react";
import { PageTitle } from "@/components/dashboard/page-title";
import { BroadcastDialog } from "./broadcast-dialog";

export default async function InboxPage() {
  const t = await getTranslations("inbox");
  const supabase = await createClient();

  const { data: clients } = await supabase
    .from("clients")
    .select("id, display_name")
    .order("display_name", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t("title")} />
      {!clients || clients.length === 0 ? (
        <EmptyState icon={MessageCircle} title={t("clientList.empty")} />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-end">
            <BroadcastDialog />
          </div>
          {clients.map((client) => (
            <Link key={client.id} href={`/inbox/${client.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardContent className="flex items-center gap-3 py-4">
                  <MessageCircle className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span className="font-medium">{client.display_name}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
