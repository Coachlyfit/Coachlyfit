"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupCoachSchema, type SignupCoachInput } from "../schemas";
import { signUpCoachAction } from "../actions";

export function SignupForm({ locale }: { locale: "ar" | "en" }) {
  const t = useTranslations("auth.signup");
  const tErrors = useTranslations("auth.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupCoachInput>({
    resolver: zodResolver(signupCoachSchema),
    defaultValues: { locale },
  });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("fullName", data.fullName);
    formData.set("businessName", data.businessName);
    formData.set("email", data.email);
    formData.set("password", data.password);
    startTransition(async () => {
      const result = await signUpCoachAction(locale, formData);
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
        <Label htmlFor="businessName">{t("businessName")}</Label>
        <Input id="businessName" autoComplete="organization" {...register("businessName")} />
        {errors.businessName && (
          <p className="text-sm text-destructive">{errors.businessName.message}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
        {errors.email && (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        )}
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
