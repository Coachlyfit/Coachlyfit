import { notFound } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getRequestCoachId } from "@/lib/auth/session";
import { ClientsService } from "@/domain/clients/clients.service";
import { subscriptionRosterStatus } from "@/domain/billing/client-subscription";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { ConversationPane } from "./conversation-pane";

export default async function MessagesThreadPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; clientId: string }>;
}) {
  const { locale, clientId } = await params;
  // A malformed id would otherwise reach Postgres as an invalid uuid (a 500
  // rather than a 404).
  if (!z.string().uuid().safeParse(clientId).success) notFound();

  const supabase = await createClient();
  const coachId = await getRequestCoachId();

  // The roster view is security_invoker: another coach's client simply isn't
  // in it, so "not found" here is also the authorization check.
  const [client, { data: coach }] = await Promise.all([
    new ClientsService(supabase).getRosterClient(clientId),
    coachId
      ? supabase
          .from("coaches")
          .select("form_templates!coaches_default_checkin_template_id_fkey(current_version_id, archived_at)")
          .eq("id", coachId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  if (!client) notFound();

  return (
    <ConversationPane
      // Remount per client: pending sends, scroll anchor and draft belong to
      // one conversation and must not carry over to the next.
      key={client.id}
      locale={locale}
      client={{
        id: client.id,
        name: client.displayName,
        status: client.status,
        program: client.program ? pickLocale(client.program, locale) : null,
        lastCheckin: client.lastCheckin,
        adherence: client.adherence,
        subscription: subscriptionRosterStatus(client.subscription, new Date()),
      }}
      // A deleted (archived) default form is treated as no default at all,
      // same rule as the dashboard's send-check-in action.
      checkinTemplateVersionId={
        coach?.form_templates?.archived_at ? null : (coach?.form_templates?.current_version_id ?? null)
      }
    />
  );
}
