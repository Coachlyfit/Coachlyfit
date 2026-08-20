"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Check, Copy, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createInviteSchema, type CreateInviteInput } from "./schemas";
import { createClientInviteAction } from "./actions";

export function InviteClientDialog({ locale }: { locale: string }) {
  const t = useTranslations("clients.dialog");
  const tErrors = useTranslations("clients.errors");
  const tInvite = useTranslations("clients");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateInviteInput>({ resolver: zodResolver(createInviteSchema) });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const formData = new FormData();
    formData.set("displayName", data.displayName);
    if (data.email) formData.set("email", data.email);
    if (data.phone) formData.set("phone", data.phone);
    startTransition(async () => {
      const result = await createClientInviteAction(locale, formData);
      if ("error" in result) setFormError(result.error);
      else setJoinUrl(result.joinUrl);
    });
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset();
      setJoinUrl(null);
      setFormError(null);
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-4" />
        {tInvite("invite")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{joinUrl ? t("linkTitle") : t("title")}</DialogTitle>
          <DialogDescription>{joinUrl ? t("linkBody") : t("subtitle")}</DialogDescription>
        </DialogHeader>

        {joinUrl ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Input readOnly value={joinUrl} className="font-mono text-xs" />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => {
                  navigator.clipboard.writeText(joinUrl);
                  setCopied(true);
                }}
                aria-label={t("copy")}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
            <Button
              variant="outline"
              render={
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(joinUrl)}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              {t("whatsapp")}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t("done")}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="displayName">{t("displayName")}</Label>
              <Input id="displayName" {...register("displayName")} />
              {errors.displayName && (
                <p className="text-sm text-destructive">{errors.displayName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">{t("phone")}</Label>
              <Input id="phone" type="tel" {...register("phone")} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {tErrors(formError)}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {t("submit")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
