"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { renameSchema, type RenameFormInput } from "../schemas";
import { renameProgramAction } from "../actions";

/** Pencil action beside the program title: a two-field rename form (the
 * same bilingual pair the create dialog asks for). The server action
 * revalidates the list and this page, then router.refresh() pulls the new
 * server-rendered title in. */
export function EditNameDialog({
  locale,
  programId,
  nameAr,
  nameEn,
}: {
  locale: string;
  programId: string;
  nameAr: string;
  nameEn: string;
}) {
  const t = useTranslations("programs.renameDialog");
  const tErrors = useTranslations("programs.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RenameFormInput>({
    resolver: zodResolver(renameSchema),
    defaultValues: { name_ar: nameAr, name_en: nameEn },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    startTransition(async () => {
      const result = await renameProgramAction(locale, programId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setOpen(false);
      toast.success(t("success"));
      router.refresh();
    });
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          reset({ name_ar: nameAr, name_en: nameEn });
          setFormError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon" aria-label={t("button")} />}>
        <Pencil className="size-4" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename_name_ar">{t("nameAr")}</Label>
            <Input id="rename_name_ar" dir="rtl" maxLength={100} {...register("name_ar")} />
            {errors.name_ar && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rename_name_en">{t("nameEn")}</Label>
            <Input id="rename_name_en" dir="ltr" maxLength={100} {...register("name_en")} />
            {errors.name_en && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending} className="min-w-24">
              {pending ? tCommon("pending") : tCommon("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
