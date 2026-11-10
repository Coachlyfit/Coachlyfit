import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import { pickBilingual, type AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { ReadonlyAnswer } from "@/components/forms-runtime/readonly-answer";

/** Read-only view of an already-submitted form ("عرض" in the sent tab). The
 * client can't edit after submitting — there is no UPDATE grant on
 * form_submissions — so this only ever shows answers. */
export async function SubmittedView({
  locale,
  formName,
  fields,
  answers,
  submittedAt,
  reviewed,
  signedUrls,
  exerciseOptions,
  foodOptions,
}: {
  locale: AppLocale;
  formName: string;
  fields: FormField[];
  answers: Record<string, unknown>;
  submittedAt: string | null;
  reviewed: boolean;
  signedUrls: Record<string, string>;
  exerciseOptions?: LibraryRefOption[];
  foodOptions?: LibraryRefOption[];
}) {
  const t = await getTranslations("forms.clientList");
  const tView = await getTranslations("forms.fill.view");

  return (
    <section aria-labelledby="submitted-title" className="flex flex-col gap-4">
      <div className="flex items-center gap-2 lg:hidden">
        <Link
          href="/c/forms?tab=sent"
          aria-label={tView("back")}
          className="flex size-11 items-center justify-center rounded-xl hover:bg-muted"
        >
          <ArrowRight className="size-5 ltr:rotate-180" aria-hidden="true" />
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-card">
        <header className="flex flex-col gap-1.5 border-b border-border px-5 py-4">
          <h1 id="submitted-title" className="text-xl font-bold">
            {formName}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {submittedAt && (
              <span>{t("sentOn", { date: formatDate(submittedAt, locale, { day: "numeric", month: "short", year: "numeric" }) })}</span>
            )}
            {reviewed && (
              <span className="rounded-md bg-success-tint px-2 py-0.5 text-xs font-medium text-success-tint-foreground">
                {t("reviewed")}
              </span>
            )}
          </div>
        </header>
        <dl className="flex flex-col px-5">
          {fields
            .filter((f) => f.type !== "section")
            .map((field) => (
              <div key={field.id} className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0">
                <dt className="text-sm text-muted-foreground">{pickBilingual(field.label, locale)}</dt>
                <dd className="whitespace-pre-wrap break-words">
                  <ReadonlyAnswer
                    field={field}
                    value={answers[field.id]}
                    locale={locale}
                    refOptions={field.type === "exercise_ref" ? exerciseOptions : foodOptions}
                    signedUrls={signedUrls}
                  />
                </dd>
              </div>
            ))}
        </dl>
      </div>
    </section>
  );
}
