"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { createFoodSchema, type CreateFoodFormInput, type CreateFoodInput } from "./schemas";
import { createFoodAction, updateFoodAction, type searchFoodsAction } from "./actions";
import { FoodFields } from "./food-fields";

type Food = Awaited<ReturnType<typeof searchFoodsAction>>["rows"][number];

type Mode = "create" | "clone" | "edit";

/** Same three-mode shape as ExerciseDialog — see there for why "create" owns
 * its trigger and "clone"/"edit" don't. */
export function FoodDialog({
  locale,
  mode,
  item,
  open,
  onOpenChange,
  onSaved,
  hideTrigger,
  defaults,
}: {
  locale: AppLocale;
  mode: Mode;
  item?: Food;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: (created?: Food) => void;
  /** Suppresses the built-in "create" trigger button for callers (e.g. the
   * diet plan's food picker) that open this dialog from their own button. */
  hideTrigger?: boolean;
  /** Prefills a "create" form, e.g. the recipe form's inline "Create
   * “{query}”" passes the typed name. Read once on mount: callers re-key. */
  defaults?: Partial<Pick<CreateFoodFormInput, "name_ar" | "name_en">>;
}) {
  const t = useTranslations("library.food");
  const tCommon = useTranslations("common");
  const tLibrary = useTranslations("library");
  const tErrors = useTranslations("library.errors");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateFoodFormInput, unknown, CreateFoodInput>({
    resolver: zodResolver(createFoodSchema),
    defaultValues: {
      name_ar: item?.name_ar ?? defaults?.name_ar ?? "",
      name_en: item?.name_en ?? defaults?.name_en ?? "",
      serving_label: item?.serving_label ?? "",
      category: (item?.category as CreateFoodFormInput["category"]) ?? "other",
      kcal: item?.kcal ?? 0,
      protein_g: item?.protein_g ?? 0,
      carb_g: item?.carb_g ?? 0,
      fat_g: item?.fat_g ?? 0,
      notes_ar: item?.notes_ar ?? "",
      notes_en: item?.notes_en ?? "",
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    formData.set("serving_label", data.serving_label);
    formData.set("category", data.category);
    formData.set("kcal", String(data.kcal));
    formData.set("protein_g", String(data.protein_g));
    formData.set("carb_g", String(data.carb_g));
    formData.set("fat_g", String(data.fat_g));
    if (data.notes_ar) formData.set("notes_ar", data.notes_ar);
    if (data.notes_en) formData.set("notes_en", data.notes_en);
    // Same rule as ExerciseDialog: provenance is set once, here, and never
    // on an "edit" submit.
    if (mode === "clone" && item) formData.set("source_food_id", item.id);

    startTransition(async () => {
      const result =
        mode === "edit" && item
          ? await updateFoodAction(locale, item.id, formData)
          : await createFoodAction(locale, formData);
      if (result && "error" in result) {
        setFormError(result.error);
        return;
      }
      if (mode === "create") reset();
      setOpen(false);
      onSaved(result && "food" in result ? (result.food as Food) : undefined);
    });
  });

  const title = mode === "edit" ? t("editTitle") : mode === "clone" ? t("cloneTitle") : t("add");
  const submitLabel = mode === "create" ? t("submit") : t("save");
  const idPrefix = `food_${mode}_`;

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {mode === "create" && !hideTrigger && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          {t("add")}
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {mode === "clone" && item && (
          <p className="text-sm text-muted-foreground">
            {tLibrary("basedOn", { name: pickLocale(item, locale) })}
          </p>
        )}
        {mode === "edit" && item?.source_food_id && (
          <p className="text-sm text-muted-foreground">
            {tLibrary("basedOn", { name: pickLocale(item, locale, "source_name") })}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FoodFields idPrefix={idPrefix} register={register} control={control} errors={errors} />
          {formError && (
            <p className="text-sm text-destructive">
              {tErrors.has(formError) ? tErrors(formError) : tErrors("unknown")}
            </p>
          )}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : submitLabel}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
