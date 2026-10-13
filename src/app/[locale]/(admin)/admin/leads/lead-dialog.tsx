"use client";

import { useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import type { Lead } from "@/domain/leads/leads.service";
import { createLeadAction, updateLeadAction } from "./actions";
import { leadSchema, type LeadFormInput } from "./schemas";

const SOURCES = ["instagram", "referral", "personal", "other"];
const FIELD = "h-11 md:h-10";

/** Add (no `lead`) or edit. Controlled: the page mounts one per target, keyed
 * by lead id, so the fields start from that lead's current values. */
export function LeadDialog({ locale, lead, onClose }: { locale: string; lead?: Lead; onClose: () => void }) {
  const t = useTranslations("admin.leads.form");
  const tErrors = useTranslations("admin.leads.errors");
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors },
  } = useForm<LeadFormInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      email: lead?.email ?? "",
      fullName: lead?.full_name ?? "",
      source: lead?.source ?? "",
      locale: lead?.locale === "en" ? "en" : "ar",
      notes: lead?.notes ?? "",
    },
  });
  const leadLocale = useWatch({ control, name: "locale" });

  function onSave(values: LeadFormInput) {
    startTransition(async () => {
      const result = lead ? await updateLeadAction(locale, lead.id, values) : await createLeadAction(locale, values);
      if (result?.error) return void toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("save_failed"));
      toast.success(t("saved"));
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{lead ? t("editTitle") : t("addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSave)} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-email">{t("email")}</Label>
            <Input id="lead-email" type="email" dir="ltr" className={FIELD} aria-invalid={!!errors.email} {...register("email")} />
            {errors.email && <p className="text-xs text-destructive">{t("emailInvalid")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-name">{t("name")}</Label>
            <Input id="lead-name" className={FIELD} maxLength={100} {...register("fullName")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-source">{t("source")}</Label>
            <Input id="lead-source" dir="ltr" className={FIELD} maxLength={50} list="lead-sources" {...register("source")} />
            <datalist id="lead-sources">
              {SOURCES.map((source) => (
                <option key={source} value={source} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("locale")}</Label>
            <Segmented
              value={leadLocale}
              onChange={(value) => setValue("locale", value)}
              label={t("locale")}
              options={[
                { value: "ar", label: t("localeAr") },
                { value: "en", label: t("localeEn") },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lead-notes">{t("notes")}</Label>
            <Textarea id="lead-notes" rows={3} maxLength={2000} {...register("notes")} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="min-w-24">
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
