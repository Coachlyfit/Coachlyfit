"use client";

import { useSyncExternalStore } from "react";
import { Controller, useWatch, type UseFormReturn } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Copy, Download, Share2 } from "lucide-react";
import QRCode from "qrcode";
import { Button, buttonVariants } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getRootDomain, SLUG_PATTERN } from "@/lib/tenant/portal-slug";
import type { PortalFormInput } from "@/app/[locale]/(coach)/settings/portal-schema";
import { UpgradePrompt } from "@/components/dashboard/upgrade-prompt";
import { CheckinTemplatePicker } from "./checkin-template-picker";

const noopSubscribe = () => () => {};

/** Portal tab: the link clients sign in at, plus the check-in form sent
 * automatically when a plan ends. */
export function PortalFields({
  form,
  savedSlug,
  templates,
  canEditSlug,
}: {
  form: UseFormReturn<PortalFormInput>;
  savedSlug: string;
  templates: { id: string; name_ar: string; name_en: string }[];
  /** Whether the plan includes white label. Without it the address the
   * coach already has keeps working, it just can't be changed. */
  canEditSlug: boolean;
}) {
  const t = useTranslations("settings.portal");
  const tSettings = useTranslations("settings");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale();
  const {
    register,
    control,
    formState: { errors },
  } = form;

  // Copy and QR stay pinned to the server-confirmed slug until save
  // succeeds, so the coach can't hand out a link for a slug that didn't
  // actually save.
  const protocol = useSyncExternalStore(noopSubscribe, () => window.location.protocol, () => "");
  const canShare = useSyncExternalStore(noopSubscribe, () => typeof navigator.share === "function", () => false);
  const savedUrl = protocol ? `${protocol}//${savedSlug}.${getRootDomain()}/${locale}/login` : "";

  const { data: qrDataUrl } = useQuery({
    queryKey: ["settings", "portal-qr", savedUrl],
    queryFn: () => QRCode.toDataURL(savedUrl),
    enabled: !!savedUrl,
    staleTime: Infinity,
  });

  // Advisory only -- the unique index (23505 -> slug_taken in
  // updateSlugAction) is what actually stops a duplicate.
  const slug = useWatch({ control, name: "slug" });
  const debouncedSlug = useDebouncedValue(slug, 400);
  const checkable = SLUG_PATTERN.test(debouncedSlug) && debouncedSlug !== savedSlug;
  const { data: taken, isFetching: checking } = useQuery({
    queryKey: ["settings", "slug-taken", debouncedSlug],
    queryFn: async () => {
      const { data, error } = await createClient().rpc("get_portal_branding", { p_slug: debouncedSlug });
      if (error) throw error;
      return data !== null;
    },
    enabled: checkable,
  });
  const settled = checkable && debouncedSlug === slug;

  function copy() {
    navigator.clipboard.writeText(savedUrl);
    toast.success(t("copied"));
  }

  async function shareQr() {
    if (!qrDataUrl) return;
    const blob = await (await fetch(qrDataUrl)).blob();
    const file = new File([blob], `${savedSlug}-qr.png`, { type: "image/png" });
    try {
      await navigator.share(navigator.canShare?.({ files: [file] }) ? { files: [file], url: savedUrl } : { url: savedUrl });
    } catch {
      // The coach dismissed the share sheet.
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="portal_slug">{t("slugLabel")}</Label>
        <InputGroup dir="ltr" className="h-11 md:h-10">
          <InputGroupInput
            id="portal_slug"
            className="font-mono"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!errors.slug}
            readOnly={!canEditSlug}
            {...register("slug")}
          />
          <InputGroupAddon align="inline-end" className="font-mono text-xs font-normal md:text-sm">
            .{getRootDomain()}
          </InputGroupAddon>
        </InputGroup>
        {!canEditSlug ? (
          <UpgradePrompt feature="slug" />
        ) : errors.slug ? (
          <p className="text-sm text-destructive">{t("slugFormat")}</p>
        ) : settled && checking ? (
          <p className="text-xs text-muted-foreground">{t("checking")}</p>
        ) : settled && taken === true ? (
          <p className="text-sm text-destructive">{tErrors("slug_taken")}</p>
        ) : settled && taken === false ? (
          <p className="text-xs text-success">{t("available")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-11 md:h-10" onClick={copy} disabled={!savedUrl}>
          <Copy className="size-4" />
          {t("copy")}
        </Button>
        {qrDataUrl && (
          <a
            href={qrDataUrl}
            download={`${savedSlug}-qr.png`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "h-11 md:h-10" })}
          >
            <Download className="size-4" />
            {t("downloadQr")}
          </a>
        )}
        {qrDataUrl && canShare && (
          <Button type="button" variant="outline" size="sm" className="h-11 md:h-10" onClick={shareQr}>
            <Share2 className="size-4" />
            {t("shareQr")}
          </Button>
        )}
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local base64 data URI, not a remote asset next/image can optimize
          <img src={qrDataUrl} alt={t("qrAlt")} className="ms-auto size-20" />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="default-checkin-template">{tSettings("checkinTemplateTitle")}</Label>
        <Controller
          name="default_checkin_template_id"
          control={control}
          render={({ field }) => (
            <CheckinTemplatePicker templates={templates} value={field.value} onChange={field.onChange} />
          )}
        />
        <p className="text-xs text-muted-foreground">{tSettings("checkinTemplateHint")}</p>
      </div>
    </>
  );
}
