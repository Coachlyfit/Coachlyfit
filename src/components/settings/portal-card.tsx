"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Check, Copy } from "lucide-react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { updateSlugAction } from "@/app/[locale]/(coach)/settings/actions";
import { getRootDomain } from "@/lib/tenant/portal-slug";

// Mirrors the DNS-label CHECK constraint on coaches.slug
// (20260826000001_portal_branding.sql) so bad input gets caught before the
// round trip.
const slugFormSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/, "slugFormat"),
});
type SlugFormInput = z.input<typeof slugFormSchema>;

export function PortalCard({ slug }: { slug: string }) {
  const t = useTranslations("settings.portal");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SlugFormInput>({ resolver: zodResolver(slugFormSchema), defaultValues: { slug } });

  // The URL box, Copy button, and QR code all stay pinned to the
  // server-confirmed slug until save succeeds, so the coach can't hand out
  // a link for a slug that didn't actually save.
  const [protocol, setProtocol] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from window.location, an external system with no server-side value; effect is the correct place to read it
  useEffect(() => setProtocol(window.location.protocol), []);
  const savedUrl = protocol ? `${protocol}//${slug}.${getRootDomain()}/${locale}/login` : "";

  useEffect(() => {
    if (!savedUrl) return;
    QRCode.toDataURL(savedUrl).then(setQrDataUrl);
  }, [savedUrl]);

  const onSubmit = handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateSlugAction(locale, data.slug);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("saved"));
    });
  });

  function copy() {
    navigator.clipboard.writeText(savedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-2" noValidate>
          <Label htmlFor="portal_slug">{t("slugLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input id="portal_slug" dir="ltr" {...register("slug")} />
            <Button type="submit" disabled={pending} className="min-w-24">
              {pending ? tCommon("pending") : t("save")}
            </Button>
          </div>
          {errors.slug ? (
            <p className="text-sm text-destructive">{t("slugFormat")}</p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("slugHint")}</p>
          )}
        </form>
        <div className="flex flex-col gap-2">
          <Label>{t("urlLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input readOnly dir="ltr" value={savedUrl} className="font-mono text-xs" />
            <Button type="button" variant="outline" size="icon-sm" onClick={copy} aria-label={t("copy")}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </div>
        {qrDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- local base64 data URI, not a remote asset next/image can optimize
          <img src={qrDataUrl} alt={t("qrAlt")} className="size-32 self-center" />
        )}
      </CardContent>
    </Card>
  );
}
