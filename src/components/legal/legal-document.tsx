import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { LEGAL_CONTACT_EMAIL, LEGAL_SLUGS, LEGAL_VERSION, type LegalDoc, type LegalSlug } from "@/content/legal";

const NAV_KEY: Record<LegalSlug, "terms" | "privacy" | "cookies" | "acceptableUse" | "billing"> = {
  terms: "terms",
  privacy: "privacy",
  cookies: "cookies",
  "acceptable-use": "acceptableUse",
  billing: "billing",
};

export async function LegalDocument({ doc, slug, locale }: { doc: LegalDoc; slug: LegalSlug; locale: AppLocale }) {
  const t = await getTranslations("legal");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 lg:grid lg:grid-cols-[220px_1fr] lg:gap-12">
      <aside className="mb-8 self-start lg:sticky lg:top-24 lg:mb-0">
        <nav aria-label={t("nav.title")}>
          <p className="mb-3 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
            {t("nav.title")}
          </p>
          <ul className="flex flex-col">
            {LEGAL_SLUGS.map((s) => (
              <li key={s}>
                <Link
                  href={`/legal/${s}`}
                  aria-current={s === slug ? "page" : undefined}
                  className={cn(
                    "block border-s-2 py-1.5 ps-3 text-sm",
                    s === slug
                      ? "border-primary font-medium text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t(`nav.${NAV_KEY[s]}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <article className="max-w-[72ch]">
        <h1 className="text-3xl font-semibold tracking-tight">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("lastUpdated", { date: formatDate(LEGAL_VERSION, locale) })}
        </p>

        <nav aria-label={t("onThisPage")} className="mt-8">
          <p className="mb-2 text-sm font-medium">{t("onThisPage")}</p>
          <ul className="flex flex-col gap-1 text-sm">
            {doc.sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                  {s.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <Separator className="my-8" />

        <div className="flex flex-col gap-8">
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-xl font-semibold">{s.heading}</h2>
              {s.paragraphs?.map((p) => (
                <p key={p} className="mt-3 leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
              {s.items && (
                <ul className="mt-3 list-disc space-y-1.5 ps-5 leading-relaxed text-muted-foreground">
                  {s.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <Card className="mt-12">
          <CardHeader>
            <CardTitle className="text-base">{t("contactTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {t.rich("contactBody", {
              email: LEGAL_CONTACT_EMAIL,
              link: (chunks) => (
                <a
                  href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  {chunks}
                </a>
              ),
            })}
          </CardContent>
        </Card>
      </article>
    </div>
  );
}
