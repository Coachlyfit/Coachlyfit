"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinSchema, type JoinInput } from "./schemas";
import { acceptTeamInviteSignupAction } from "./actions";

export function TeamJoinForm({ locale, token }: { locale: string; token: string }) {
  // ponytail: reuses join.form (fields are identical to the client-invite
  // flow) and clients.errors (error keys are generic, not client-specific)
  // rather than duplicating both namespaces under joinTeam.
  const t = useTranslations("join.form");
  const tErrors = useTranslations("clients.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<JoinInput>({
    resolver: zodResolver(joinSchema),
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("fullName", data.fullName);
    formData.set("email", data.email);
    formData.set("password", data.password);
    startTransition(async () => {
      const result = await acceptTeamInviteSignupAction(locale, token, formData);
      if (result?.error) setFormError(result.error);
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">{t("fullName")}</Label>
        <Input id="fullName" autoComplete="name" {...register("fullName")} />
        {errors.fullName && (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        )}
      </div>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(formError)}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full min-w-24">
        {pending ? tCommon("pending") : t("submit")}
      </Button>
    </form>
  );
}
