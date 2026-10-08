"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronLeft } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormRenderer } from "@/components/forms-runtime/form-renderer";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { FormKind } from "@/domain/forms/schema";
import { FORM_STARTERS } from "@/domain/forms/starters";
import { createTemplateAction } from "../actions";
import { KIND_META } from "../kind-meta";

// Mockup order: the two forms a coach sends most come first.
const KINDS = ["intake", "checkin", "workout", "diet", "custom"] as const satisfies readonly FormKind[];

const RADIO_CARD =
  "rounded-xl bg-card text-start ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:ring-2 aria-checked:ring-primary";

function StepHeading({ n, id, children }: { n: number; id: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground font-mono font-semibold text-background max-md:hidden"
        aria-hidden="true"
      >
        {n}
      </span>
      <h2 id={id} className="text-xl leading-7 font-semibold max-md:text-lg">
        {children}
      </h2>
    </div>
  );
}

export function NewFormClient({ locale }: { locale: AppLocale }) {
  const t = useTranslations("forms.new");
  const tKinds = useTranslations("forms.kinds");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("forms.errors");
  const [pending, startTransition] = useTransition();

  const [kind, setKind] = useState<FormKind>("checkin");
  // null = untouched, so the name keeps following the selected kind's default.
  const [nameAr, setNameAr] = useState<string | null>(null);
  const [nameEn, setNameEn] = useState<string | null>(null);
  const [wantStarter, setWantStarter] = useState(true);
  const [showNameError, setShowNameError] = useState(false);

  const starter = FORM_STARTERS[kind];
  const hasStarter = starter.fields.length > 0;
  const useStarter = wantStarter && hasStarter;
  const ar = nameAr ?? starter.name.ar;
  const en = nameEn ?? starter.name.en;
  const count = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;
  const starterHint = t.rich("suggestedHint", {
    count: starter.fields.length,
    value: formatNumber(starter.fields.length, locale),
    num: count,
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ar.trim()) {
      setShowNameError(true);
      return;
    }
    startTransition(async () => {
      // Redirects to the builder on success, so only an error comes back.
      const result = await createTemplateAction(locale, { kind, name_ar: ar, name_en: en, starter: useStarter });
      if (result?.error) toast.error(tErrors(result.error));
    });
  }

  return (
    <div className="flex flex-col gap-6 max-md:pb-20">
      <div className="flex items-center gap-2">
        <Link href="/forms" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ms-2")}>
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
          {t("back")}
        </Link>
      </div>

      <div className="flex flex-wrap items-start gap-8">
        {/* Only this column is the form: the preview below renders its own
            <form>, and forms can not nest. */}
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-[3_1_520px] flex-col gap-7">
          <section aria-labelledby="new-form-kind" className="flex flex-col gap-3.5">
            <StepHeading n={1} id="new-form-kind">
              {t("step1")}
            </StepHeading>
            <div
              role="radiogroup"
              aria-labelledby="new-form-kind"
              className="grid gap-3 max-md:gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]"
            >
              {KINDS.map((key) => {
                const Icon = KIND_META[key].icon;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={kind === key}
                    onClick={() => setKind(key)}
                    className={cn(RADIO_CARD, "flex gap-3 p-4 max-md:min-h-16 max-md:items-center max-md:px-3 max-md:py-2.5 md:flex-col md:gap-2")}
                  >
                    <span
                      className={cn("flex size-10 shrink-0 items-center justify-center rounded-[11px]", KIND_META[key].tint)}
                    >
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1 leading-snug md:gap-2">
                      <span className="text-[0.9375rem] font-semibold">{tKinds(key)}</span>
                      <span className="text-muted-foreground max-md:hidden">{t(`kinds.${key}.description`)}</span>
                      <span className="text-xs font-medium text-muted-foreground max-md:text-[0.8125rem] max-md:font-normal">
                        {t(`kinds.${key}.when`)}
                      </span>
                    </span>
                    {/* Mobile rows carry an explicit radio dot; desktop cards show the ring. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-5 shrink-0 rounded-full md:hidden",
                        kind === key ? "border-6 border-primary" : "border-[1.5px] border-muted-foreground/60"
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </section>

          <section aria-labelledby="new-form-name" className="flex flex-col gap-3.5">
            <StepHeading n={2} id="new-form-name">
              {t("step2")}
            </StepHeading>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3.5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name_ar">{t("nameAr")}</Label>
                <Input
                  id="name_ar"
                  dir="rtl"
                  required
                  maxLength={100}
                  value={ar}
                  onChange={(e) => setNameAr(e.target.value)}
                  aria-invalid={showNameError && !ar.trim()}
                  aria-describedby={showNameError && !ar.trim() ? "name_ar_error" : undefined}
                  className="h-11 text-base"
                />
                {showNameError && !ar.trim() && (
                  <p id="name_ar_error" className="text-sm text-destructive">
                    {t("nameRequired")}
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name_en">
                  {t("nameEn")} <span className="font-normal text-muted-foreground">{t("optional")}</span>
                </Label>
                <Input
                  id="name_en"
                  dir="ltr"
                  maxLength={100}
                  value={en}
                  onChange={(e) => setNameEn(e.target.value)}
                  className="h-11 text-base"
                />
              </div>
            </div>
          </section>

          <section aria-labelledby="new-form-start" className="flex flex-col gap-3.5">
            <StepHeading n={3} id="new-form-start">
              {t("step3")}
            </StepHeading>
            <div
              role="radiogroup"
              aria-labelledby="new-form-start"
              className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 max-md:hidden"
            >
              <button
                type="button"
                role="radio"
                aria-checked={useStarter}
                disabled={!hasStarter}
                onClick={() => setWantStarter(true)}
                className={cn(RADIO_CARD, "flex flex-col gap-1 p-4 disabled:opacity-50")}
              >
                <span className="font-semibold">{t("suggested")}</span>
                <span className="text-muted-foreground">{hasStarter ? starterHint : t("suggestedNone")}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!useStarter}
                onClick={() => setWantStarter(false)}
                className={cn(RADIO_CARD, "flex flex-col gap-1 p-4")}
              >
                <span className="font-semibold">{t("blank")}</span>
                <span className="text-muted-foreground">{t("blankHint")}</span>
              </button>
            </div>
            {/* Same choice as the two cards above, as one switch on mobile. */}
            <label className="flex min-h-16 items-center justify-between gap-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10 md:hidden">
              <span className="flex flex-col leading-snug">
                <span className="font-semibold">{t("suggestedSwitch")}</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {hasStarter ? starterHint : t("suggestedNone")}
                </span>
              </span>
              <Switch checked={useStarter} disabled={!hasStarter} onCheckedChange={setWantStarter} />
            </label>
          </section>

          <div className="flex flex-wrap gap-2.5 border-t border-border pt-5">
            {/* Pinned above the bottom nav on mobile (end-20 clears the
                feedback widget), inline from md up. */}
            <Button
              type="submit"
              size="lg"
              disabled={pending}
              className="px-6 text-base max-md:fixed max-md:start-4 max-md:end-20 max-md:bottom-[calc(var(--bottom-nav-h)+0.75rem)] max-md:z-30 max-md:shadow-lg"
            >
              {pending ? tCommon("pending") : t("create")}
            </Button>
            <Link href="/forms" className={cn(buttonVariants({ variant: "secondary", size: "lg" }), "px-4.5 max-md:hidden")}>
              {tCommon("cancel")}
            </Link>
          </div>
        </form>

        <aside
          aria-label={t("previewBadge")}
          className="flex min-w-0 flex-[2_1_320px] flex-col gap-3 rounded-[18px] bg-muted p-5 lg:sticky lg:top-4"
        >
          <span className="self-start rounded-md bg-card px-2.5 py-0.5 text-xs font-medium">{t("previewBadge")}</span>
          <div className="flex flex-col gap-3.5 rounded-xl bg-card p-4.5">
            <div className="flex flex-col">
              <span className="text-lg font-semibold">{(locale === "ar" ? ar || en : en || ar) || "—"}</span>
              <span className="text-muted-foreground">{t(`kinds.${kind}.when`)}</span>
            </div>
            {useStarter ? (
              // Remount per kind: the renderer registers inputs by field id.
              <FormRenderer key={kind} fields={starter.fields} mode="preview" />
            ) : (
              <div className="rounded-xl border-[1.5px] border-dashed border-muted-foreground/40 px-3 py-7 text-center text-muted-foreground">
                {t("previewBlank")}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
