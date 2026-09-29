"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, Printer, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { AppLocale } from "@/domain/locale";
import type { DietPlanTree } from "@/domain/nutrition/diet-plans.service";
import { Link, useRouter } from "@/i18n/navigation";
import { createDietPlanSchema, type CreateDietPlanFormInput } from "../schemas";
import { deleteDietPlanAction, updateDietPlanAction } from "../actions";
import { AssignDietTemplateDialog } from "./assign-diet-template-dialog";
import { SaveAsTemplateDialog } from "./save-as-template-dialog";

type Plan = Pick<
  DietPlanTree,
  "id" | "client_id" | "program_id" | "name_ar" | "name_en" | "start_date" | "end_date" | "notes_ar" | "notes_en"
>;

/** Name, dates and client notes — the only place a plan's own fields are
 * editable after creation. Notes are what the client reads above their
 * meals, so the hint steers supplements/hydration/instructions there.
 * Dates only show for a standalone assigned plan (a template has no real
 * start, a program variant follows its program) but are always sent back
 * unchanged, since updateDietPlanAction writes end_date "" as null. */
function PlanDetailsDialog({
  locale,
  plan,
  open,
  onOpenChange,
}: {
  locale: string;
  plan: Plan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("diets.detailsDialog");
  const tCreate = useTranslations("diets.createDialog");
  const tErrors = useTranslations("diets.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const showDates = !!plan.client_id && !plan.program_id;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateDietPlanFormInput>({
    resolver: zodResolver(createDietPlanSchema),
    defaultValues: {
      name_ar: plan.name_ar,
      name_en: plan.name_en,
      start_date: plan.start_date ?? "",
      end_date: plan.end_date ?? "",
      notes_ar: plan.notes_ar ?? "",
      notes_en: plan.notes_en ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    for (const key of ["name_ar", "name_en", "start_date", "end_date", "notes_ar", "notes_en"] as const) {
      if (data[key]) formData.set(key, String(data[key]));
    }
    startTransition(async () => {
      const result = await updateDietPlanAction(locale, plan.id, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      onOpenChange(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="details_name_ar">{tCreate("nameAr")}</Label>
              <Input id="details_name_ar" dir="rtl" {...register("name_ar")} />
              {errors.name_ar && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="details_name_en">{tCreate("nameEn")}</Label>
              <Input id="details_name_en" dir="ltr" {...register("name_en")} />
              {errors.name_en && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
            </div>
          </div>
          {showDates && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="details_start_date">{tCreate("startDate")}</Label>
                <Input id="details_start_date" type="date" {...register("start_date")} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="details_end_date">{tCreate("endDate")}</Label>
                <Input id="details_end_date" type="date" {...register("end_date")} />
                {errors.end_date?.message && (
                  <p className="text-sm text-destructive">{tErrors(errors.end_date.message)}</p>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="details_notes_ar">{t("notesAr")}</Label>
            <DialogDescription className="text-xs">{t("notesHint")}</DialogDescription>
            <Textarea id="details_notes_ar" dir="rtl" rows={3} {...register("notes_ar")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="details_notes_en">{t("notesEn")}</Label>
            <Textarea id="details_notes_en" dir="ltr" rows={3} {...register("notes_en")} />
            {(errors.notes_ar || errors.notes_en) && (
              <p className="text-sm text-destructive">{t("notesTooLong")}</p>
            )}
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24 self-start">
            {pending ? tCommon("pending") : tCommon("save")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PlanToolbar({
  locale,
  plan,
  clients,
}: {
  locale: AppLocale;
  plan: Plan;
  clients: { id: string; display_name: string }[];
}) {
  const t = useTranslations("diets");
  const tPrint = useTranslations("print");
  const tErrors = useTranslations("diets.errors");
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePending, startDelete] = useTransition();
  const isTemplate = !plan.client_id;

  function deletePlan() {
    startDelete(async () => {
      const result = await deleteDietPlanAction(locale, plan.id);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      router.push(plan.program_id ? `/programs/${plan.program_id}` : "/diets");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" onClick={() => setDetailsOpen(true)}>
        <Settings2 className="size-4" />
        {t("detailsDialog.button")}
      </Button>
      {!plan.program_id &&
        (isTemplate ? (
          <AssignDietTemplateDialog locale={locale} dietPlanId={plan.id} clients={clients} />
        ) : (
          <SaveAsTemplateDialog locale={locale} dietPlanId={plan.id} nameAr={plan.name_ar} nameEn={plan.name_en} />
        ))}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t("moreActions")} />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/print/diet/${plan.id}`} target="_blank" />}>
            <Printer className="size-4" />
            {tPrint("button")}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
            {t("deletePlan")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {detailsOpen && (
        <PlanDetailsDialog locale={locale} plan={plan} open={detailsOpen} onOpenChange={setDetailsOpen} />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("confirmDeletePlanTitle")}
        description={t("confirmDeletePlanBody")}
        confirmLabel={t("deletePlan")}
        onConfirm={deletePlan}
        pending={deletePending}
      />
    </div>
  );
}
