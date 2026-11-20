import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageTitle } from "@/components/dashboard/page-title";
import { StatusBadge } from "@/components/status-badge";
import { Card } from "@/components/ui/card";
import { CoachingApplicationsService } from "@/domain/coaching-applications/coaching-applications.service";
import type { ApplicationStatus } from "@/domain/coaching-applications/schema";
import type { AppLocale } from "@/domain/locale";
import { Link } from "@/i18n/navigation";
import { getRequestCoachId } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { waLink } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/server";
import { STATUS_TONE } from "../status-tone";
import { TriageForm } from "./triage-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ApplicationPage({ params }: { params: Promise<{ locale: AppLocale; id: string }> }) {
  const { locale, id } = await params;
  const coachId = await getRequestCoachId();
  if (!coachId || !UUID.test(id)) notFound();
  const app = await new CoachingApplicationsService(await createClient()).get(coachId, id);
  if (!app) notFound();

  const t = await getTranslations("applications");
  const status = app.status as ApplicationStatus;
  const phoneDigits = app.phone.replace(/[^\d+]/g, "");

  const rows: Array<[string, React.ReactNode]> = [
    [t("fields.email"), <a key="e" href={`mailto:${app.email}`} dir="ltr" className="underline">{app.email}</a>],
    [
      t("fields.phone"),
      <a key="p" href={waLink(phoneDigits)} dir="ltr" className="underline" target="_blank" rel="noreferrer">
        {app.phone}
      </a>,
    ],
    [t("fields.goal"), t(`goals.${app.goal as "other"}`)],
    [t("fields.activityLevel"), t(`activity.${app.activity_level as "light"}`)],
    [t("fields.source"), app.source || "—"],
    [t("table.submitted"), formatDate(app.created_at, locale, { dateStyle: "medium", timeStyle: "short" })],
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageTitle title={app.name} />
      <Link href="/applications" className="text-sm text-muted-foreground hover:underline">
        {t("back")}
      </Link>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-3xl leading-9 font-semibold">{app.name}</h1>
        <StatusBadge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</StatusBadge>
      </header>

      <Card className="gap-3 p-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[max-content_1fr]">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
          <dt className="text-sm text-muted-foreground">{t("fields.message")}</dt>
          <dd className="whitespace-pre-wrap">{app.message || "—"}</dd>
        </dl>
      </Card>

      <TriageForm id={app.id} locale={locale} status={status} notes={app.coach_notes ?? ""} />
    </div>
  );
}
