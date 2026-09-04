"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { phoneSchema, verifyOtpSchema, type PhoneInput, type VerifyOtpInput } from "../schemas";
import { sendOtpAction, verifyOtpAction } from "../actions";

export function OtpForm({ locale }: { locale: "ar" | "en" }) {
  const t = useTranslations("auth.signup");
  const tErrors = useTranslations("auth.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);

  const phoneForm = useForm<PhoneInput>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { locale },
  });

  const otpForm = useForm<VerifyOtpInput>({
    resolver: zodResolver(verifyOtpSchema),
    defaultValues: { locale },
  });

  const onSendOtp = phoneForm.handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("phone", data.phone);
    startTransition(async () => {
      const result = await sendOtpAction(locale, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      otpForm.setValue("phone", data.phone);
      setPhone(data.phone);
    });
  });

  const onVerifyOtp = otpForm.handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("phone", data.phone);
    formData.set("token", data.token);
    startTransition(async () => {
      const result = await verifyOtpAction(locale, formData);
      if (result?.error) setFormError(result.error);
    });
  });

  if (phone) {
    return (
      <form onSubmit={onVerifyOtp} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-2">
          <Label htmlFor="token">{t("otpLabel")}</Label>
          <Input
            id="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            {...otpForm.register("token")}
          />
          {otpForm.formState.errors.token && (
            <p className="text-sm text-destructive">{otpForm.formState.errors.token.message}</p>
          )}
        </div>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {tErrors(formError)}
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full min-w-24">
          {pending ? tCommon("pending") : t("otpSubmit")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSendOtp} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">{t("phone")}</Label>
        <div className="flex gap-2">
          <span className="flex h-9 items-center rounded-md border px-3 font-mono text-sm text-muted-foreground">
            +20
          </span>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            className="flex-1"
            {...phoneForm.register("phone")}
          />
        </div>
        {phoneForm.formState.errors.phone && (
          <p className="text-sm text-destructive">{phoneForm.formState.errors.phone.message}</p>
        )}
      </div>
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors(formError)}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full min-w-24">
        {pending ? tCommon("pending") : t("otpSend")}
      </Button>
    </form>
  );
}
