"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tierSchema, type TierInput } from "./schemas";
import { updateTierAction } from "./actions";

type Tier = {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  price_egp_monthly: number;
  max_clients: number;
  is_active: boolean;
  features: unknown;
};

function TierCard({ locale, tier }: { locale: string; tier: Tier }) {
  const t = useTranslations("admin.settings.plans");
  const tErrors = useTranslations("admin.settings.errors");
  const [pending, startTransition] = useTransition();
  const features = (tier.features ?? {}) as Record<string, boolean>;

  const { register, handleSubmit, watch, setValue } = useForm<TierInput>({
    resolver: zodResolver(tierSchema),
    defaultValues: {
      name_ar: tier.name_ar,
      name_en: tier.name_en,
      price_egp_monthly: tier.price_egp_monthly,
      max_clients: tier.max_clients,
      is_active: tier.is_active,
      forms_builder: !!features.forms_builder,
      custom_library: !!features.custom_library,
      priority_support: !!features.priority_support,
      white_label: !!features.white_label,
      custom_branding: !!features.custom_branding,
    },
  });

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(data)) {
      formData.set(key, String(value));
    }
    startTransition(async () => {
      const result = await updateTierAction(locale, tier.id, formData);
      if (result?.error) toast.error(tErrors(result.error));
      else toast.success(t("saved"));
    });
  });

  const featureKeys = [
    "forms_builder",
    "custom_library",
    "priority_support",
    "white_label",
    "custom_branding",
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{tier.key}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>{t("nameAr")}</Label>
              <Input dir="rtl" {...register("name_ar")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("nameEn")}</Label>
              <Input dir="ltr" {...register("name_en")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("price")}</Label>
              <Input type="number" min={0} step="0.01" {...register("price_egp_monthly")} />
            </div>
            <div className="flex flex-col gap-2">
              <Label>{t("maxClients")}</Label>
              <Input type="number" min={1} {...register("max_clients")} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label className="text-sm font-normal">{t("isActive")}</Label>
            <Switch checked={!!watch("is_active")} onCheckedChange={(v) => setValue("is_active", v)} />
          </div>
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {featureKeys.map((key) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <Label className="text-sm font-normal">{t(`features.${key}`)}</Label>
                <Switch checked={!!watch(key)} onCheckedChange={(v) => setValue(key, v)} />
              </div>
            ))}
          </div>
          <Button type="submit" disabled={pending} className="min-w-24">
            {t("save")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function PlansTab({ locale, tiers }: { locale: string; tiers: Tier[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 items-start">
      {tiers.map((tier) => (
        <TierCard key={tier.id} locale={locale} tier={tier} />
      ))}
    </div>
  );
}
