"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MUSCLE_GROUPS } from "@/domain/library/taxonomy";
import { createExerciseSchema, type CreateExerciseInput } from "./schemas";
import { createExerciseAction } from "./actions";

export function AddExerciseDialog({ locale, onCreated }: { locale: string; onCreated: () => void }) {
  const t = useTranslations("library.exercise");
  const tGroups = useTranslations("library.muscleGroups");
  const tErrors = useTranslations("library.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<CreateExerciseInput>({
    resolver: zodResolver(createExerciseSchema),
    // Select must be controlled from the first render — an undefined
    // initial value here would flip it uncontrolled -> controlled the
    // moment a user picks something, which Base UI (correctly) warns on.
    defaultValues: { muscle_group: "other" },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    if (data.muscle_group) formData.set("muscle_group", data.muscle_group);
    if (data.equipment) formData.set("equipment", data.equipment);
    if (data.video_url) formData.set("video_url", data.video_url);
    startTransition(async () => {
      const result = await createExerciseAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setOpen(false);
      onCreated();
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="size-4" />
        {t("add")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name_ar">{t("nameAr")}</Label>
            <Input id="name_ar" dir="rtl" {...register("name_ar")} />
            {errors.name_ar && <p className="text-sm text-destructive">{errors.name_ar.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name_en">{t("nameEn")}</Label>
            <Input id="name_en" dir="ltr" {...register("name_en")} />
            {errors.name_en && <p className="text-sm text-destructive">{errors.name_en.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="muscle_group">{t("muscleGroup")}</Label>
            <Controller
              name="muscle_group"
              control={control}
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="muscle_group">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map((group) => (
                      <SelectItem key={group} value={group}>
                        {tGroups(group)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="equipment">{t("equipment")}</Label>
            <Input id="equipment" {...register("equipment")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="video_url">{t("videoUrl")}</Label>
            <Input id="video_url" type="url" placeholder="https://youtube.com/watch?v=..." {...register("video_url")} />
            {errors.video_url && <p className="text-sm text-destructive">{errors.video_url.message}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending}>
            {t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
