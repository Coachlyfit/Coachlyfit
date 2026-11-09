"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations, useLocale } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Segmented } from "@/components/ui/segmented";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { COACH_LOGOS_BUCKET } from "@/domain/billing/invoices.service";
import {
  businessProfileSchema,
  type BusinessProfileFormInput,
} from "@/app/[locale]/(coach)/settings/business-profile-schema";
import { portalSchema, type PortalFormInput } from "@/app/[locale]/(coach)/settings/portal-schema";
import { brandSchema, type BrandFormInput } from "@/app/[locale]/(coach)/settings/brand-schema";
import {
  updateBrandingAction,
  updateBusinessProfileAction,
  updateDefaultCheckinTemplateAction,
  updateSlugAction,
} from "@/app/[locale]/(coach)/settings/actions";
import { BillingFields } from "./billing-fields";
import { BrandFields } from "./brand-fields";
import { CustomMetricsCard } from "./custom-metrics-card";
import { IdentityFields } from "./identity-fields";
import { PackagesCard, type Package, type PackageDraft } from "./packages-card";
import { PaymentMethodsCard } from "./payment-methods-card";
import { PortalFields } from "./portal-fields";
import { SettingsPreview, type SettingsTab } from "./settings-preview";

const TABS = ["identity", "billing", "packages", "portal", "brand"] as const satisfies readonly SettingsTab[];
const FORM_ID = "settings-form";

type Named = { id: string; name_ar: string; name_en: string };

export function SettingsShell({
  coachId,
  userId,
  avatarUrl,
  profile,
  portal,
  brand,
  brandingEnabled,
  whiteLabelEnabled,
  checkinTemplates,
  packages,
  paymentMethods,
  customMetrics,
}: {
  coachId: string;
  userId: string;
  /** Public avatar URL of the signed-in user, or null. */
  avatarUrl: string | null;
  profile: BusinessProfileFormInput;
  portal: PortalFormInput;
  brand: BrandFormInput;
  /** Whether the coach's plan includes custom branding (Studio). */
  brandingEnabled: boolean;
  /** Whether the plan includes white label: a logo and a custom portal address. */
  whiteLabelEnabled: boolean;
  checkinTemplates: Named[];
  packages: Package[];
  paymentMethods: Named[];
  customMetrics: { id: string; label_ar: string; label_en: string; unit: string }[];
}) {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("settings.errors");
  const locale = useLocale();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [pendingTab, setPendingTab] = useState<SettingsTab | null>(null);
  const [packageDraft, setPackageDraft] = useState<PackageDraft | null>(null);

  const param = useSearchParams().get("tab");
  const tab: SettingsTab = TABS.find((id) => id === param) ?? "identity";

  // Identity and billing are two views of one coaches-row form (one action);
  // the portal tab has its own. Packages has no scalar fields to save.
  const profileForm = useForm<BusinessProfileFormInput>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: profile,
  });
  const portalForm = useForm<PortalFormInput>({ resolver: zodResolver(portalSchema), defaultValues: portal });
  const brandForm = useForm<BrandFormInput>({ resolver: zodResolver(brandSchema), defaultValues: brand });
  const profileDirty = profileForm.formState.isDirty;
  const { isDirty: portalDirty, dirtyFields: portalDirtyFields } = portalForm.formState;
  const brandDirty = brandForm.formState.isDirty;
  const hasForm = tab !== "packages" && (tab !== "brand" || brandingEnabled);
  const dirty =
    tab === "portal" ? portalDirty : tab === "brand" ? hasForm && brandDirty : hasForm && profileDirty;
  const anyDirty = profileDirty || portalDirty || brandDirty;
  const activeForm = tab === "portal" ? portalForm : tab === "brand" ? brandForm : profileForm;
  const invalid = Object.keys(activeForm.formState.errors).length > 0;

  const logoPath = useWatch({ control: profileForm.control, name: "logo_path" });
  const logoUrl = useMemo(
    () => (logoPath ? createClient().storage.from(COACH_LOGOS_BUCKET).getPublicUrl(logoPath).data.publicUrl : null),
    [logoPath]
  );

  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    // ponytail: native confirm on in-app link clicks -- the App Router has no
    // route blocker. Browser Back is not intercepted; revisit if Next ships one.
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest?.("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm(t("unsaved.leave"))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [anyDirty, t]);

  // replaceState, not pushState: tabs don't stack history entries, so Back
  // leaves the page instead of flipping tabs under an unsaved form.
  function goTab(next: SettingsTab) {
    window.history.replaceState(null, "", `?tab=${next}`);
  }

  function requestTab(next: SettingsTab) {
    if (next === tab) return;
    if (dirty) setPendingTab(next);
    else goTab(next);
  }

  function discardAndSwitch() {
    if (!pendingTab) return;
    profileForm.reset();
    portalForm.reset();
    brandForm.reset();
    goTab(pendingTab);
    setPendingTab(null);
  }

  const saveProfile = profileForm.handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateBusinessProfileAction(locale, data);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      profileForm.reset(profileForm.getValues());
      toast.success(t("saved"));
    });
  });

  const savePortal = portalForm.handleSubmit((data) => {
    startTransition(async () => {
      if (portalDirtyFields.default_checkin_template_id) {
        const result = await updateDefaultCheckinTemplateAction(locale, data.default_checkin_template_id);
        if (result?.error) {
          toast.error(tErrors(result.error));
          return;
        }
      }
      if (portalDirtyFields.slug) {
        const result = await updateSlugAction(locale, data.slug);
        if (result?.error) {
          toast.error(tErrors(result.error));
          return;
        }
      }
      portalForm.reset(portalForm.getValues());
      toast.success(t("saved"));
    });
  });

  const saveBrand = brandForm.handleSubmit((data) => {
    startTransition(async () => {
      const result = await updateBrandingAction(locale, data);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      brandForm.reset(brandForm.getValues());
      toast.success(t("saved"));
    });
  });

  const saveButton = (className?: string) => (
    <Button type="submit" form={FORM_ID} disabled={!dirty || pending} className={cn("min-w-28", className)}>
      {pending ? tCommon("pending") : tCommon("save")}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <Tabs value={tab} onValueChange={(value) => requestTab(value as SettingsTab)}>
        <TabsList
          aria-label={t("tabsLabel")}
          className="w-full gap-1.5 bg-transparent p-0 group-data-horizontal/tabs:h-auto md:w-fit md:gap-1 md:bg-muted md:p-1"
        >
          {TABS.map((id) => (
            <TabsTrigger
              key={id}
              value={id}
              className="h-10 flex-none rounded-full border-border px-4 data-active:border-foreground data-active:bg-foreground data-active:text-background md:rounded-lg md:border-transparent md:data-active:border-transparent md:data-active:bg-background md:data-active:text-foreground dark:data-active:border-foreground dark:data-active:bg-foreground dark:data-active:text-background dark:md:data-active:border-input dark:md:data-active:bg-input/30 dark:md:data-active:text-foreground"
            >
              {t(`tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Segmented
        label={t("view.label")}
        value={mode}
        onChange={setMode}
        options={[
          { value: "edit", label: t("view.edit") },
          { value: "preview", label: t("view.preview") },
        ]}
        className="flex *:flex-1 md:hidden"
      />

      <div className="grid items-start gap-6 md:grid-cols-2">
        <section
          aria-label={t("view.edit")}
          className={cn(
            "flex min-w-0 flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10 md:p-6",
            mode === "preview" && "max-md:hidden"
          )}
        >
          {tab === "identity" && (
            <>
              <h2 className="text-xl font-semibold">{t("headings.identity")}</h2>
              <form id={FORM_ID} onSubmit={saveProfile} className="flex flex-col gap-4" noValidate>
                <IdentityFields
                  form={profileForm}
                  coachId={coachId}
                  userId={userId}
                  avatarUrl={avatarUrl}
                  logoUrl={logoUrl}
                  canSetLogo={whiteLabelEnabled}
                />
              </form>
            </>
          )}
          {tab === "billing" && (
            <>
              <h2 className="text-xl font-semibold">{t("headings.billing")}</h2>
              <form id={FORM_ID} onSubmit={saveProfile} className="flex flex-col gap-4" noValidate>
                <BillingFields form={profileForm} />
              </form>
              <PaymentMethodsCard methods={paymentMethods} />
            </>
          )}
          {tab === "packages" && <PackagesCard packages={packages} onDraftChange={setPackageDraft} />}
          {tab === "portal" && (
            <>
              <h2 className="text-xl font-semibold">{t("headings.portal")}</h2>
              <p className="text-sm text-muted-foreground">{t("portal.description")}</p>
              <form id={FORM_ID} onSubmit={savePortal} className="flex flex-col gap-4" noValidate>
                <PortalFields
                  form={portalForm}
                  savedSlug={portal.slug}
                  templates={checkinTemplates}
                  canEditSlug={whiteLabelEnabled}
                />
              </form>
              <CustomMetricsCard metrics={customMetrics} />
            </>
          )}
          {tab === "brand" && (
            <>
              <h2 className="text-xl font-semibold">{t("headings.brand")}</h2>
              <p className="text-sm text-muted-foreground">{t("brand.description")}</p>
              <form id={FORM_ID} onSubmit={saveBrand} className="flex flex-col gap-4" noValidate>
                <BrandFields form={brandForm} enabled={brandingEnabled} />
              </form>
            </>
          )}

          {hasForm && invalid && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-4">
            <Link href="/settings/account" className="font-medium text-primary underline-offset-4 hover:underline">
              {t("accountAndTeam")}
            </Link>
            {hasForm && saveButton("max-md:hidden")}
          </div>
        </section>

        <SettingsPreview
          tab={tab}
          profileControl={profileForm.control}
          portalControl={portalForm.control}
          brandControl={brandForm.control}
          brandingEnabled={brandingEnabled}
          logoUrl={logoUrl}
          packages={packages}
          packageDraft={packageDraft}
          paymentMethods={paymentMethods}
          className={cn("md:sticky md:top-4", mode === "edit" && "max-md:hidden")}
        />
      </div>

      {hasForm && (
        <div className="sticky bottom-(--bottom-nav-h) z-10 -mx-4 border-t border-border bg-background px-4 py-3 md:hidden">
          {saveButton("w-full")}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingTab}
        onOpenChange={(open) => !open && setPendingTab(null)}
        title={t("unsaved.title")}
        description={t("unsaved.description")}
        confirmLabel={t("unsaved.discard")}
        onConfirm={discardAndSwitch}
      />
    </div>
  );
}
