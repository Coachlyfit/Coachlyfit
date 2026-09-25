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
import { useRouter } from "@/i18n/navigation";
import { createDietPlanSchema, type CreateDietPlanFormInput } from "./schemas";
import { createDietPlanAction } from "./actions";

const NO_CLIENT = "__template__";

export function CreateDietPlanDialog({
  locale,
  clients,
  defaultClientId,
  defaultOpen = false,
  trigger,
}: {
  locale: string;
  clients: { id: string; display_name: string }[];
  /** Preselects a client and defaults start_date to today — see
   * CreateProgramDialog's defaultClientId for why. */
  defaultClientId?: string;
  defaultOpen?: boolean;
  trigger?: React.ReactNode;
}) {
  const t = useTranslations("diets.createDialog");
  const tDiets = useTranslations("diets");
  const tErrors = useTranslations("diets.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateDietPlanFormInput>({
    resolver: zodResolver(createDietPlanSchema),
    defaultValues: {
      client_id: defaultClientId ?? "",
      start_date: defaultClientId ? new Date().toISOString().slice(0, 10) : undefined,
    },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    if (data.client_id) formData.set("client_id", data.client_id);
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    if (data.start_date) formData.set("start_date", data.start_date);
    if (data.end_date) formData.set("end_date", data.end_date);
    startTransition(async () => {
      const result = await createDietPlanAction(locale, formData);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      reset();
      setOpen(false);
      router.push(`/diets/${result.id}`);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" />
        {trigger ?? tDiets("new")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
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
            <Label htmlFor="client_id">{t("client")}</Label>
            <Controller
              name="client_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value || NO_CLIENT}
                  onValueChange={(v) => v !== null && field.onChange(v === NO_CLIENT ? "" : v)}
                >
                  <SelectTrigger id="client_id">
                    <SelectValue>
                      {(v: string) => (v === NO_CLIENT ? t("clientNone") : clients.find((c) => c.id === v)?.display_name)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CLIENT}>{t("clientNone")}</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="start_date">{t("startDate")}</Label>
              <Input id="start_date" type="date" {...register("start_date")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="end_date">{t("endDate")}</Label>
              <Input id="end_date" type="date" {...register("end_date")} />
              {errors.end_date?.message && (
                <p className="text-sm text-destructive">{tErrors(errors.end_date.message)}</p>
              )}
            </div>
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
