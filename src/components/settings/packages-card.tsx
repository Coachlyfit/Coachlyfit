"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import {
  createPackageAction,
  updatePackageAction,
  deletePackageAction,
} from "@/app/[locale]/(coach)/settings/billing-actions";

const packageFormSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  duration_days: z.coerce.number().int().min(1).max(3650),
  price_egp: z.coerce.number().min(0),
});
type PackageFormInput = z.input<typeof packageFormSchema>;

export type Package = { id: string; name_ar: string; name_en: string; duration_days: number; price_egp: number };

/** What's being typed in the add/edit dialog right now (`id: null` = a new
 * package), so the live preview can show it before it's saved. */
export type PackageDraft = {
  id: string | null;
  name_ar?: string;
  name_en?: string;
  duration_days?: unknown;
  price_egp?: unknown;
};

function mono(chunks: React.ReactNode) {
  return <span className="font-mono tabular-nums">{chunks}</span>;
}

export function PackagesCard({
  packages,
  onDraftChange,
}: {
  packages: Package[];
  onDraftChange?: (draft: PackageDraft | null) => void;
}) {
  const t = useTranslations("settings.packages");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale() as AppLocale;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Package | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PackageFormInput>({ resolver: zodResolver(packageFormSchema) });

  const draft = useWatch({ control });
  const editingId = editing?.id ?? null;
  useEffect(() => {
    onDraftChange?.(open ? { id: editingId, ...draft } : null);
  }, [open, editingId, draft, onDraftChange]);

  function openCreate() {
    setEditing(null);
    reset({ name_ar: "", name_en: "", duration_days: undefined, price_egp: undefined });
    setOpen(true);
  }

  function openEdit(pkg: Package) {
    setEditing(pkg);
    reset({ name_ar: pkg.name_ar, name_en: pkg.name_en, duration_days: pkg.duration_days, price_egp: pkg.price_egp });
    setOpen(true);
  }

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    formData.set("duration_days", String(data.duration_days));
    formData.set("price_egp", String(data.price_egp));
    startTransition(async () => {
      const result = editing
        ? await updatePackageAction(locale, editing.id, formData)
        : await createPackageAction(locale, formData);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      reset();
      setEditing(null);
      setOpen(false);
    });
  });

  function confirmDelete() {
    if (!pendingDelete) return;
    startTransition(async () => {
      const result = await deletePackageAction(locale, pendingDelete);
      if (result?.error) toast.error(tErrors(result.error));
      setPendingDelete(null);
    });
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{t("title")}</h2>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) setEditing(null);
          }}
        >
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" onClick={openCreate} />}>
            <Plus className="size-4" />
            {t("add")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? t("edit") : t("add")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pkg_name_ar">{t("nameAr")}</Label>
                <Input id="pkg_name_ar" dir="rtl" {...register("name_ar")} />
                {errors.name_ar && <p className="text-sm text-destructive">{errors.name_ar.message}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="pkg_name_en">{t("nameEn")}</Label>
                <Input id="pkg_name_en" dir="ltr" {...register("name_en")} />
                {errors.name_en && <p className="text-sm text-destructive">{errors.name_en.message}</p>}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pkg_duration">{t("duration")}</Label>
                  <Input id="pkg_duration" type="number" min={1} className="font-mono tabular-nums" {...register("duration_days")} />
                  {errors.duration_days && <p className="text-sm text-destructive">{errors.duration_days.message}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pkg_price">{t("price")}</Label>
                  <Input id="pkg_price" type="number" min={0} step="0.01" className="font-mono tabular-nums" {...register("price_egp")} />
                  {errors.price_egp && <p className="text-sm text-destructive">{errors.price_egp.message}</p>}
                </div>
              </div>
              <Button type="submit" disabled={pending} className="min-w-24">
                {pending ? tCommon("pending") : t("submit")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {packages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {packages.map((pkg) => (
            <li key={pkg.id} className="flex items-center gap-3 rounded-xl py-2 ps-3.5 pe-1.5 ring-1 ring-foreground/10">
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <span className="truncate font-semibold">{pickLocale(pkg, locale)}</span>
                <span className="text-sm text-muted-foreground">
                  {t.rich("durationDays", { count: pkg.duration_days, num: mono })}
                </span>
              </span>
              <span className="shrink-0 font-mono font-semibold tabular-nums">
                {formatNumber(pkg.price_egp, locale)} <span className="font-sans text-xs font-normal">{t("egp")}</span>
              </span>
              <span className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${t("edit")}: ${pickLocale(pkg, locale)}`}
                  onClick={() => openEdit(pkg)}
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${t("delete")}: ${pickLocale(pkg, locale)}`}
                  onClick={() => setPendingDelete(pkg.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={t("confirmDeleteTitle")}
        confirmLabel={t("delete")}
        onConfirm={confirmDelete}
        pending={pending}
      />
    </>
  );
}
