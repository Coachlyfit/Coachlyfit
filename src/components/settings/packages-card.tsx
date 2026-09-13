"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { createPackageAction, deletePackageAction } from "@/app/[locale]/(coach)/settings/billing-actions";

const packageFormSchema = z.object({
  name_ar: z.string().min(1).max(100),
  name_en: z.string().min(1).max(100),
  duration_days: z.coerce.number().int().min(1).max(3650),
  price_egp: z.coerce.number().min(0),
});
type PackageFormInput = z.input<typeof packageFormSchema>;

type Package = { id: string; name_ar: string; name_en: string; duration_days: number; price_egp: number };

export function PackagesCard({ packages }: { packages: Package[] }) {
  const t = useTranslations("settings.packages");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale() as AppLocale;
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PackageFormInput>({ resolver: zodResolver(packageFormSchema) });

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    formData.set("duration_days", String(data.duration_days));
    formData.set("price_egp", String(data.price_egp));
    startTransition(async () => {
      const result = await createPackageAction(locale, formData);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      reset();
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
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">{t("title")}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
            <Plus className="size-4" />
            {t("add")}
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("add")}</DialogTitle>
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
                  <Input id="pkg_duration" type="number" min={1} {...register("duration_days")} />
                  {errors.duration_days && <p className="text-sm text-destructive">{errors.duration_days.message}</p>}
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pkg_price">{t("price")}</Label>
                  <Input id="pkg_price" type="number" min={0} step="0.01" {...register("price_egp")} />
                  {errors.price_egp && <p className="text-sm text-destructive">{errors.price_egp.message}</p>}
                </div>
              </div>
              <Button type="submit" disabled={pending} className="min-w-24">
                {pending ? tCommon("pending") : t("submit")}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {packages.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("nameAr")}</TableHead>
                <TableHead>{t("duration")}</TableHead>
                <TableHead>{t("price")}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell className="font-medium">{pickLocale(pkg, locale)}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {t("durationDays", { count: pkg.duration_days })}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {formatNumber(pkg.price_egp, locale)} {t("egp")}
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setPendingDelete(pkg.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={t("confirmDeleteTitle")}
        confirmLabel={t("delete")}
        onConfirm={confirmDelete}
        pending={pending}
      />
    </Card>
  );
}
