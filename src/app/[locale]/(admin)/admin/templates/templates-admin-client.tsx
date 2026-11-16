"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LibraryBig, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { formatNumber } from "@/lib/format";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { asPlanLevel, PLAN_LEVELS } from "@/domain/programs/plan-meta";
import { LIBRARY_CATEGORIES } from "@/domain/programs/platform/library-view";
import { setTemplatePublishedAction, updateTemplateDetailsAction } from "./actions";

export type AdminTemplate = {
  id: string;
  slug: string;
  kind: "workout" | "plan";
  duration_weeks: number | null;
  gender_target: string | null;
  name_ar: string;
  name_en: string;
  description_ar: string | null;
  description_en: string | null;
  level: string | null;
  categories: string[];
  days_per_week: number | null;
  published: boolean;
  exercises: number;
};

const chip =
  "h-8 rounded-full border px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:border-transparent aria-pressed:bg-primary aria-pressed:text-primary-foreground";

function useErrorMessage() {
  const t = useTranslations("admin.templates.errors");
  return (code: string) => (t.has(code) ? t(code) : t("unknown"));
}

function EditDialog({
  locale,
  template,
  onClose,
}: {
  locale: string;
  template: AdminTemplate;
  onClose: () => void;
}) {
  const t = useTranslations("admin.templates");
  const tCat = useTranslations("programs.library.categories");
  const tLevels = useTranslations("programs.levels");
  const message = useErrorMessage();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name_ar: template.name_ar,
    name_en: template.name_en,
    description_ar: template.description_ar ?? "",
    description_en: template.description_en ?? "",
    level: asPlanLevel(template.level),
    days_per_week: template.days_per_week ? String(template.days_per_week) : "",
    duration_weeks: template.duration_weeks ? String(template.duration_weeks) : "",
    gender_target: (template.gender_target as "female" | "male" | "all" | null) ?? null,
    categories: template.categories,
  });
  const tGender = useTranslations("programs.library.genders");
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function save() {
    startTransition(async () => {
      const days = form.days_per_week.trim();
      const weeks = form.duration_weeks.trim();
      const result = await updateTemplateDetailsAction(locale, {
        id: template.id,
        ...form,
        days_per_week: days === "" ? null : Number(days),
        duration_weeks: weeks === "" ? null : Number(weeks),
      });
      if (result && "error" in result) {
        toast.error(message(result.error));
        return;
      }
      toast.success(t("toast.saved"));
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("editDialog.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-name-en">{t("editDialog.nameEn")}</Label>
              <Input id="tpl-name-en" value={form.name_en} onChange={(e) => set("name_en", e.target.value)} dir="ltr" maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-name-ar">{t("editDialog.nameAr")}</Label>
              <Input id="tpl-name-ar" value={form.name_ar} onChange={(e) => set("name_ar", e.target.value)} dir="rtl" maxLength={120} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-desc-en">{t("editDialog.descriptionEn")}</Label>
            <Textarea id="tpl-desc-en" value={form.description_en} onChange={(e) => set("description_en", e.target.value)} dir="ltr" maxLength={500} rows={3} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-desc-ar">{t("editDialog.descriptionAr")}</Label>
            <Textarea id="tpl-desc-ar" value={form.description_ar} onChange={(e) => set("description_ar", e.target.value)} dir="rtl" maxLength={500} rows={3} />
          </div>
          <div role="group" aria-label={t("editDialog.level")} className="flex flex-wrap items-center gap-1.5">
            <span className="me-1 text-sm text-muted-foreground">{t("editDialog.level")}</span>
            <button type="button" aria-pressed={form.level === null} onClick={() => set("level", null)} className={chip}>
              {t("editDialog.noLevel")}
            </button>
            {PLAN_LEVELS.map((l) => (
              <button key={l} type="button" aria-pressed={form.level === l} onClick={() => set("level", l)} className={chip}>
                {tLevels(l)}
              </button>
            ))}
          </div>
          <div role="group" aria-label={t("editDialog.categories")} className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">{t("editDialog.categories")}</span>
            <div className="flex flex-wrap gap-1.5">
              {LIBRARY_CATEGORIES.map((c) => {
                const on = form.categories.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("categories", on ? form.categories.filter((x) => x !== c) : [...form.categories, c])}
                    className={chip}
                  >
                    {tCat(c)}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex w-32 flex-col gap-1.5">
              <Label htmlFor="tpl-days">{t("editDialog.daysPerWeek")}</Label>
              <Input
                id="tpl-days"
                type="number"
                inputMode="numeric"
                min={1}
                max={7}
                value={form.days_per_week}
                onChange={(e) => set("days_per_week", e.target.value)}
              />
            </div>
            {template.kind === "plan" && (
              <div className="flex w-32 flex-col gap-1.5">
                <Label htmlFor="tpl-weeks">{t("editDialog.durationWeeks")}</Label>
                <Input
                  id="tpl-weeks"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={52}
                  value={form.duration_weeks}
                  onChange={(e) => set("duration_weeks", e.target.value)}
                />
              </div>
            )}
          </div>
          {template.kind === "plan" && (
            <div role="group" aria-label={t("editDialog.gender")} className="flex flex-wrap items-center gap-1.5">
              <span className="me-1 text-sm text-muted-foreground">{t("editDialog.gender")}</span>
              <button type="button" aria-pressed={form.gender_target === null} onClick={() => set("gender_target", null)} className={chip}>
                {t("editDialog.noGender")}
              </button>
              {(["female", "male", "all"] as const).map((g) => (
                <button key={g} type="button" aria-pressed={form.gender_target === g} onClick={() => set("gender_target", g)} className={chip}>
                  {tGender(g)}
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={save} disabled={pending || !form.name_ar.trim() || !form.name_en.trim()}>
            {pending ? t("editDialog.saving") : t("editDialog.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function TemplatesAdminClient({ locale, templates }: { locale: AppLocale; templates: AdminTemplate[] }) {
  const t = useTranslations("admin.templates");
  const tLevels = useTranslations("programs.levels");
  const message = useErrorMessage();
  const [, startTransition] = useTransition();
  // optimistic publish state, reverted if the action fails
  const [published, setPublished] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<AdminTemplate | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "workout" | "plan">("all");
  const tKind = useTranslations("admin.templates.kind");
  const shown = kindFilter === "all" ? templates : templates.filter((x) => x.kind === kindFilter);

  if (templates.length === 0) {
    return (
      <Card>
        <EmptyState icon={LibraryBig} title={t("empty.title")} description={t("empty.description")} />
      </Card>
    );
  }

  function toggle(tpl: AdminTemplate, next: boolean) {
    setPublished((p) => ({ ...p, [tpl.id]: next }));
    startTransition(async () => {
      const result = await setTemplatePublishedAction(locale, tpl.id, next);
      if (result && "error" in result) {
        setPublished((p) => ({ ...p, [tpl.id]: !next }));
        toast.error(message(result.error));
        return;
      }
      toast.success(t(next ? "toast.published" : "toast.unpublished"));
    });
  }

  return (
    <>
      <div role="group" aria-label={tKind("label")} className="flex flex-wrap items-center gap-1.5">
        <span className="me-1 text-sm text-muted-foreground">{tKind("label")}</span>
        {(["all", "workout", "plan"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)} className={chip}>
            {tKind(k)}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {shown.map((tpl) => {
          const level = asPlanLevel(tpl.level);
          const name = pickLocale(tpl, locale, "name");
          const isPublished = published[tpl.id] ?? tpl.published;
          return (
            <li key={tpl.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-card p-3.5 ring-1 ring-foreground/10">
              <div className="flex min-w-0 flex-1 basis-56 flex-col">
                <span className="truncate font-medium">{name}</span>
                <span dir="ltr" className="truncate text-xs text-muted-foreground">
                  {tpl.slug}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={tpl.kind === "plan" ? "default" : "secondary"}>
                  {tKind(tpl.kind)}
                  {tpl.kind === "plan" && tpl.duration_weeks ? ` · ${formatNumber(tpl.duration_weeks, locale)}` : ""}
                </Badge>
                {level && <Badge variant="outline">{tLevels(level)}</Badge>}
                <span className="text-sm text-muted-foreground">
                  {t("columns.exercises")} {formatNumber(tpl.exercises, locale)}
                </span>
              </div>
              <div className="ms-auto flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={isPublished} onCheckedChange={(v) => toggle(tpl, v)} aria-label={t("publishToggle", { name })} />
                  {t("columns.published")}
                </label>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(tpl)}>
                  <Pencil className="size-3.5" aria-hidden="true" />
                  {t("edit")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <EditDialog key={editing.id} locale={locale} template={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
