"use client";

import { useWatch, type Control } from "react-hook-form";
import { useTranslations, useLocale } from "next-intl";
import { InvoiceDocument } from "@/components/invoices/invoice-document";
import { PortalAuthFrame } from "@/components/auth/portal-auth-frame";
import { LoginCard } from "@/app/[locale]/(auth)/login/login-card";
import { calculateTotals } from "@/domain/billing/invoices";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatNumber } from "@/lib/format";
import { getRootDomain } from "@/lib/tenant/portal-slug";
import { cn } from "@/lib/utils";
import type { BusinessProfileFormInput } from "@/app/[locale]/(coach)/settings/business-profile-schema";
import type { PortalFormInput } from "@/app/[locale]/(coach)/settings/portal-schema";
import type { BrandFormInput } from "@/app/[locale]/(coach)/settings/brand-schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoachlyMark } from "@/components/brand/coachly-mark";
import { BrandLogo, BrandStyle } from "@/components/brand/coach-brand";
import { brandCss } from "@/lib/brand-theme";
import type { Package, PackageDraft } from "./packages-card";

export type SettingsTab = "identity" | "billing" | "packages" | "portal" | "brand";

type Named = { id: string; name_ar: string; name_en: string };

function mono(chunks: React.ReactNode) {
  return <span className="font-mono tabular-nums">{chunks}</span>;
}

/** What the client sees, driven by the forms' live values (not saved data)
 * so it updates while the coach types. Built from the real client-facing
 * components wherever one exists. */
export function SettingsPreview({
  tab,
  profileControl,
  portalControl,
  brandControl,
  brandingEnabled,
  logoUrl,
  packages,
  packageDraft,
  paymentMethods,
  className,
}: {
  tab: SettingsTab;
  profileControl: Control<BusinessProfileFormInput>;
  portalControl: Control<PortalFormInput>;
  brandControl: Control<BrandFormInput>;
  /** The sign-in page only shows the logo on plans with custom branding. */
  brandingEnabled: boolean;
  logoUrl: string | null;
  packages: Package[];
  packageDraft: PackageDraft | null;
  paymentMethods: Named[];
  className?: string;
}) {
  const t = useTranslations("settings.preview");

  return (
    <section
      aria-label={t("label")}
      className={cn("flex min-w-0 flex-col items-center gap-3.5 rounded-2xl bg-muted p-4 md:p-6", className)}
    >
      <span className="self-start rounded-md bg-background px-2.5 py-0.5 text-xs font-medium">
        {t(
          tab === "portal"
            ? "loginLabel"
            : tab === "packages"
              ? "packagesLabel"
              : tab === "brand"
                ? "brandLabel"
                : "invoiceLabel"
        )}
      </span>
      {tab === "brand" ? (
        <BrandPreview control={brandControl} profileControl={profileControl} logoUrl={logoUrl} />
      ) : tab === "packages" ? (
        <PackagesPreview packages={packages} draft={packageDraft} />
      ) : tab === "portal" ? (
        <LoginPreview
          profileControl={profileControl}
          portalControl={portalControl}
          logoUrl={brandingEnabled ? logoUrl : null}
        />
      ) : (
        <InvoicePreview
          control={profileControl}
          logoUrl={logoUrl}
          samplePackage={packages[0]}
          paymentMethods={tab === "billing" ? paymentMethods : []}
        />
      )}
    </section>
  );
}

function InvoicePreview({
  control,
  logoUrl,
  samplePackage,
  paymentMethods,
}: {
  control: Control<BusinessProfileFormInput>;
  logoUrl: string | null;
  samplePackage: Package | undefined;
  paymentMethods: Named[];
}) {
  const t = useTranslations("settings.preview");
  const locale = useLocale() as AppLocale;
  const values = useWatch({ control });

  const taxRate = Math.min(100, Math.max(0, Number(values.default_tax_rate) || 0));
  const { lines, subtotal, tax, total } = calculateTotals(
    [
      {
        description: samplePackage ? pickLocale(samplePackage, locale) : t("sampleItem"),
        quantity: 1,
        unit_price: samplePackage?.price_egp ?? 4000,
      },
    ],
    taxRate
  );

  return (
    <>
      <div className="w-full max-w-xl">
        <InvoiceDocument
          invoice={{
            status: "issued",
            currency: values.default_currency ?? "EGP",
            invoice_number: "INV-0042",
            issue_date: null,
            due_date: null,
            subtotal,
            tax_rate: taxRate,
            tax,
            total,
            notes: null,
          }}
          items={lines.map((line) => ({ id: "sample", ...line }))}
          parties={{
            seller: {
              business_name: values.business_name?.trim() || t("placeholders.businessName"),
              logo_path: values.logo_path ?? null,
              address: values.address?.trim() || t("placeholders.address"),
              tax_number: values.tax_number?.trim() || null,
              contact_phone: values.contact_phone?.trim() || t("placeholders.phone"),
              contact_email: values.contact_email?.trim() || t("placeholders.email"),
            },
            client: { display_name: t("sampleClient"), email: null, phone: null },
          }}
          logoUrl={logoUrl}
          locale={locale}
        />
      </div>
      {paymentMethods.length > 0 && (
        <div className="flex w-full max-w-xl flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{t("paymentMethods")}</span>
          {paymentMethods.map((method) => (
            <span key={method.id} className="rounded-full bg-background px-3 py-1 font-medium text-foreground">
              {pickLocale(method, locale)}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

function PackagesPreview({ packages, draft }: { packages: Package[]; draft: PackageDraft | null }) {
  const t = useTranslations("settings.preview");
  const tPackages = useTranslations("settings.packages");
  const locale = useLocale() as AppLocale;

  // The dialog's draft replaces the package being edited, or is appended as
  // a new one; either way it's the highlighted card.
  const rows: PackageDraft[] = packages.map((pkg) => (draft?.id === pkg.id ? { ...pkg, ...draft } : pkg));
  if (draft && draft.id === null) rows.push(draft);

  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{tPackages("empty")}</p>;

  return (
    <ul className="flex w-full max-w-lg flex-col gap-2.5">
      {rows.map((row) => (
        <li
          key={row.id ?? "draft"}
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl bg-background p-4",
            draft && row.id === draft.id && "ring-2 ring-primary"
          )}
        >
          <span className="flex min-w-0 flex-col leading-snug">
            <span className="truncate text-base font-semibold">
              <bdi>{pickLocale(row, locale) || t("placeholders.packageName")}</bdi>
            </span>
            <span className="text-sm text-muted-foreground">
              {tPackages.rich("durationDays", { count: Number(row.duration_days) || 0, num: mono })}
            </span>
          </span>
          <span className="shrink-0 font-mono text-xl font-semibold tabular-nums">
            {formatNumber(Number(row.price_egp) || 0, locale)}{" "}
            <span className="font-sans text-xs font-normal">{tPackages("egp")}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function LoginPreview({
  profileControl,
  portalControl,
  logoUrl,
}: {
  profileControl: Control<BusinessProfileFormInput>;
  portalControl: Control<PortalFormInput>;
  logoUrl: string | null;
}) {
  const t = useTranslations("settings.preview");
  const locale = useLocale();
  const slug = useWatch({ control: portalControl, name: "slug" });
  const businessName = useWatch({ control: profileControl, name: "business_name" });

  return (
    <div className="w-75 max-w-full rounded-[36px] bg-foreground p-2.5">
      <div className="flex min-h-130 flex-col overflow-hidden rounded-[28px] bg-background">
        <p dir="ltr" className="truncate bg-muted px-3 py-2 text-center font-mono text-xs text-muted-foreground">
          {slug || t("placeholders.slug")}.{getRootDomain()}
        </p>
        {/* inert: the real login UI, on display only -- not focusable, not submittable. */}
        <div inert className="flex flex-1 flex-col justify-center px-3 py-6">
          <PortalAuthFrame businessName={businessName?.trim() || t("placeholders.businessName")} logoUrl={logoUrl}>
            <LoginCard locale={locale} />
          </PortalAuthFrame>
        </div>
      </div>
    </div>
  );
}

/** The client app's home, recolored live. Overrides are scoped to this box,
 * so the rest of the settings page keeps its current colors until save. */
function BrandPreview({
  control,
  profileControl,
  logoUrl,
}: {
  control: Control<BrandFormInput>;
  profileControl: Control<BusinessProfileFormInput>;
  logoUrl: string | null;
}) {
  const t = useTranslations("settings.preview.brand");
  const tNav = useTranslations("nav");
  const values = useWatch({ control });
  const businessName = useWatch({ control: profileControl, name: "business_name" });
  // Empty slots preview as the stock orange / navy explicitly, so a pending
  // reset isn't masked by the saved brand already applied to the page.
  const css = brandCss(
    {
      primary: values.brand_primary || "#c2410c",
      accent: values.brand_accent || null,
      sidebar: values.brand_sidebar || "#0f172a",
      sidebarText: values.brand_sidebar_text || null,
    },
    "[data-brand-preview]"
  );

  return (
    <div className="w-75 max-w-full rounded-[36px] bg-foreground p-2.5">
      <BrandStyle css={css} />
      <div
        data-brand-preview
        inert
        className="flex min-h-130 flex-col gap-3 overflow-hidden rounded-[28px] bg-background p-4"
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          {logoUrl ? (
            <BrandLogo src={logoUrl} name={businessName ?? ""} />
          ) : (
            <CoachlyMark size={24} className="text-foreground" />
          )}
          <span className="truncate text-sm font-semibold">
            <bdi>{businessName?.trim() || t("businessName")}</bdi>
          </span>
        </div>
        {/* The coach's own sidebar, in miniature: one active row, one idle. */}
        <div className="flex flex-col gap-0.5 rounded-xl bg-sidebar p-2 text-sm font-medium text-sidebar-foreground">
          <span className="relative rounded-md bg-sidebar-accent px-3 py-2">
            <span aria-hidden="true" className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-sidebar-ring" />
            {tNav("dashboard")}
          </span>
          <span className="rounded-md px-3 py-2 text-sidebar-foreground/70">{tNav("clients")}</span>
        </div>
        <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <Badge variant="info" className="self-start">
            {t("badge")}
          </Badge>
          <p className="text-base font-semibold">{t("workoutTitle")}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-3/5 rounded-full bg-primary" />
          </div>
          <Button className="w-full">{t("start")}</Button>
        </div>
        <div className="rounded-xl bg-accent-tint p-4 text-accent-tint-foreground">
          <p className="text-sm font-semibold">{t("noteTitle")}</p>
          <p className="mt-1 text-xs">{t("noteBody")}</p>
        </div>
        <span className="text-sm font-medium text-primary underline underline-offset-4">{t("link")}</span>
      </div>
    </div>
  );
}
