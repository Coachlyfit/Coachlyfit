"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changeEmailAction } from "@/app/[locale]/(coach)/settings/actions";

const changeEmailSchema = z.object({ email: z.string().email() });
type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const t = useTranslations("settings.changeEmail");
  const tErrors = useTranslations("settings.errors");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangeEmailInput>({ resolver: zodResolver(changeEmailSchema), defaultValues: { email: currentEmail } });

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await changeEmailAction(locale, data.email);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("checkNewEmail"));
      setEditing(false);
    });
  });

  if (!editing) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">{t("label")}</span>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{currentEmail}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
            {t("change")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <span className="text-sm text-muted-foreground">{t("label")}</span>
      <div className="flex items-center gap-2">
        <Input type="email" dir="ltr" {...register("email")} />
        <Button type="submit" disabled={pending} className="min-w-24">
          {pending ? tCommon("pending") : t("save")}
        </Button>
        <Button type="button" variant="outline" onClick={() => setEditing(false)}>
          {tCommon("cancel")}
        </Button>
      </div>
      {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
    </form>
  );
}
