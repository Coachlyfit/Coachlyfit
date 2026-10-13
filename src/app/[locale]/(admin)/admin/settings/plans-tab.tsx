"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/status-badge";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import { PLAN_TINT } from "../coach-bits";
import { updateTiersAction } from "./actions";
import { FEATURE_KEYS, tiersSchema, type TierInput } from "./schemas";

type Tier = {
  id: string;
  key: string;
  name_ar: string;
  name_en: string;
  price_egp_monthly: number;
  max_clients: number | null;
  max_team_members: number | null;
  is_active: boolean;
  features: unknown;
};

type LimitKey = "max_clients" | "max_team_members";

// Shown when "no limit" is unticked on a plan that had no cap to go back to.
const DEFAULT_CAP: Record<LimitKey, number> = { max_clients: 10, max_team_members: 3 };
// A plan can have no team seats, but never no clients.
const LIMIT_MIN: Record<LimitKey, number> = { max_clients: 1, max_team_members: 0 };

function toDraft(tier: Tier): TierInput {
  const features = (tier.features ?? {}) as Record<string, boolean>;
  return {
    id: tier.id,
    name_ar: tier.name_ar,
    name_en: tier.name_en,
    price_egp_monthly: tier.price_egp_monthly,
    max_clients: tier.max_clients,
    max_team_members: tier.max_team_members,
    is_active: tier.is_active,
    forms_builder: !!features.forms_builder,
    custom_library: !!features.custom_library,
    priority_support: !!features.priority_support,
    white_label: !!features.white_label,
    custom_branding: !!features.custom_branding,
    task_management: !!features.task_management,
  };
}

const FIELD = "h-11 md:h-10";
const MONO = "font-mono font-semibold tabular-nums";
const CELL = "border-s border-border px-4 py-2.5 align-middle";
const ROW_HEAD = "px-5 py-3 text-start font-medium";

export function PlansTab({
  locale,
  tiers,
  coachCounts,
}: {
  locale: AppLocale;
  tiers: Tier[];
  /** Subscriptions per tier id. */
  coachCounts: Record<string, number>;
}) {
  const t = useTranslations("admin.settings.plans");
  const tErrors = useTranslations("admin.settings.errors");
  const [pending, startTransition] = useTransition();
  const saved = tiers.map(toDraft);
  const [draft, setDraft] = useState(saved);
  const [openId, setOpenId] = useState<string | null>(tiers[0]?.id ?? null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const parsed = tiersSchema.safeParse(draft);
  const invalid = new Set(parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join(".")));

  function set<K extends keyof TierInput>(i: number, key: K, value: TierInput[K]) {
    setDraft((rows) => rows.map((row, j) => (j === i ? { ...row, [key]: value } : row)));
  }

  function save() {
    if (!parsed.success) return void toast.error(tErrors("invalid_input"));
    startTransition(async () => {
      const result = await updateTiersAction(locale, parsed.data);
      if (result?.error) toast.error(tErrors(result.error));
      else {
        // The schema trims names; keep the draft equal to what was stored.
        setDraft(parsed.data);
        toast.success(t("saved"));
      }
    });
  }

  if (tiers.length === 0) {
    return (
      <div className="rounded-xl bg-card ring-1 ring-foreground/10">
        <EmptyState brandMark title={t("empty")} />
      </div>
    );
  }

  // Each control is rendered twice (table from md up, accordion below), so
  // they are controlled by `draft` rather than registered refs.
  const number = (i: number, key: "price_egp_monthly" | LimitKey, label: string, className?: string) => (
    <Input
      type="number"
      inputMode="numeric"
      dir="ltr"
      min={key === "price_egp_monthly" ? 0 : LIMIT_MIN[key]}
      aria-label={label}
      aria-invalid={invalid.has(`${i}.${key}`)}
      value={Number.isNaN(draft[i][key]) ? "" : (draft[i][key] ?? "")}
      onChange={(e) => set(i, key, e.target.value === "" ? Number.NaN : Number(e.target.value))}
      className={cn(FIELD, MONO, "text-base md:text-base", className)}
    />
  );

  const text = (i: number, key: "name_ar" | "name_en", label: string) => (
    <Input
      dir={key === "name_ar" ? "rtl" : "ltr"}
      aria-label={label}
      aria-invalid={invalid.has(`${i}.${key}`)}
      value={draft[i][key]}
      onChange={(e) => set(i, key, e.target.value)}
      maxLength={100}
      className={FIELD}
    />
  );

  const price = (i: number) => (
    <span className="flex items-center gap-1.5">
      {number(i, "price_egp_monthly", t("price"))}
      <span className="shrink-0 text-muted-foreground">{t("currency")}</span>
    </span>
  );

  const limit = (i: number, key: LimitKey, label: string) => {
    const unlimited = draft[i][key] === null;
    return (
      <span className="flex items-center gap-2">
        {unlimited ? (
          <span className={cn(FIELD, "flex items-center rounded-lg bg-muted px-3 font-medium")}>{t("unlimited")}</span>
        ) : (
          number(i, key, label, "w-24")
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-[0.8125rem] text-muted-foreground">
          <Checkbox
            checked={unlimited}
            onCheckedChange={(checked) => set(i, key, checked ? null : (saved[i]?.[key] ?? DEFAULT_CAP[key]))}
            className="size-4.5"
          />
          {t("noLimit")}
        </label>
      </span>
    );
  };

  const feature = (i: number, key: (typeof FEATURE_KEYS)[number], withLabel?: boolean) => (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 md:min-h-0 md:justify-start">
      {withLabel && <span>{t(`features.${key}`)}</span>}
      <span className="flex items-center gap-2">
        <Checkbox checked={draft[i][key]} onCheckedChange={(checked) => set(i, key, checked)} className="size-5" />
        {!withLabel && (
          <span className={cn(!draft[i][key] && "text-muted-foreground")}>
            {draft[i][key] ? t("available") : t("unavailable")}
          </span>
        )}
      </span>
    </label>
  );

  const active = (i: number) => (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 md:min-h-0">
      <Switch checked={draft[i].is_active} onCheckedChange={(checked) => set(i, "is_active", checked)} />
      {draft[i].is_active ? (
        <StatusBadge tone="success">{t("isActive")}</StatusBadge>
      ) : (
        <Badge variant="secondary" className="rounded-md">
          {t("inactive")}
        </Badge>
      )}
    </label>
  );

  const keyBadge = (tier: Tier) => (
    <Badge dir="ltr" className={cn("rounded-md font-semibold capitalize", PLAN_TINT[tier.key] ?? "bg-muted text-foreground")}>
      {tier.key}
    </Badge>
  );

  const coaches = (tier: Tier) =>
    t.rich("coaches", {
      count: coachCounts[tier.id] ?? 0,
      value: formatNumber(coachCounts[tier.id] ?? 0, locale),
      num: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
    });

  const rows: [string, (i: number) => React.ReactNode][] = [
    [
      t("name"),
      (i) => (
        <span className="flex flex-col gap-1.5">
          {text(i, "name_ar", t("nameAr"))}
          {text(i, "name_en", t("nameEn"))}
        </span>
      ),
    ],
    [t("price"), price],
    [t("maxClients"), (i) => limit(i, "max_clients", t("maxClients"))],
    [t("maxTeamMembers"), (i) => limit(i, "max_team_members", t("maxTeamMembers"))],
  ];

  return (
    <section aria-label={t("title")} className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr>
              <th scope="col" className="w-55 px-5 py-4.5 text-start align-bottom font-medium text-muted-foreground">
                {t("plan")}
              </th>
              {tiers.map((tier, i) => (
                <th key={tier.id} scope="col" className="border-s border-border px-4 py-4.5 text-start align-top font-normal">
                  <span className="flex flex-col gap-1.5">
                    <span className="flex items-center justify-between gap-2">
                      {keyBadge(tier)}
                      <span className="text-xs font-medium text-muted-foreground">{coaches(tier)}</span>
                    </span>
                    <span className="text-lg font-semibold">{locale === "ar" ? draft[i].name_ar : draft[i].name_en}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-t [&>tr]:border-border">
            {rows.map(([label, cell]) => (
              <tr key={label}>
                <th scope="row" className={ROW_HEAD}>
                  {label}
                </th>
                {tiers.map((tier, i) => (
                  <td key={tier.id} className={CELL}>
                    {cell(i)}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="bg-background">
              <th
                scope="rowgroup"
                colSpan={tiers.length + 1}
                className="px-5 py-2.5 text-start text-[0.8125rem] font-semibold text-muted-foreground"
              >
                {t("featuresGroup")}
              </th>
            </tr>
            {FEATURE_KEYS.map((key) => (
              <tr key={key}>
                <th scope="row" className={ROW_HEAD}>
                  {t(`features.${key}`)}
                </th>
                {tiers.map((tier, i) => (
                  <td key={tier.id} className={CELL}>
                    {feature(i, key)}
                  </td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row" className={ROW_HEAD}>
                {t("availableForSignup")}
              </th>
              {tiers.map((tier, i) => (
                <td key={tier.id} className={CELL}>
                  {active(i)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-border md:hidden">
        {tiers.map((tier, i) => (
          <details
            key={tier.id}
            open={openId === tier.id}
            onToggle={(e) => {
              const isOpen = e.currentTarget.open;
              setOpenId((current) => (isOpen ? tier.id : current === tier.id ? null : current));
            }}
            className="group"
          >
            <summary className="flex min-h-16 cursor-pointer list-none items-center gap-2.5 px-4 py-3 [&::-webkit-details-marker]:hidden">
              {keyBadge(tier)}
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <span className="truncate font-semibold">{locale === "ar" ? draft[i].name_ar : draft[i].name_en}</span>
                <span className="text-[0.8125rem] text-muted-foreground">
                  {t("summary", { on: FEATURE_KEYS.filter((key) => draft[i][key]).length, total: FEATURE_KEYS.length })}
                  {" · "}
                  {coaches(tier)}
                </span>
              </span>
              <span className={MONO}>
                {Number.isNaN(draft[i].price_egp_monthly) ? "—" : formatNumber(draft[i].price_egp_monthly, locale)}
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="flex flex-col gap-2.5 border-t border-border/60 px-4 pt-3 pb-4">
              {rows.map(([label, cell]) => (
                <div key={label} className="flex flex-col gap-1">
                  <span className="text-[0.8125rem] text-muted-foreground">{label}</span>
                  {cell(i)}
                </div>
              ))}
              <div className="flex flex-col">{FEATURE_KEYS.map((key) => <div key={key}>{feature(i, key, true)}</div>)}</div>
              <div className="flex items-center justify-between gap-2">
                <span>{t("availableForSignup")}</span>
                {active(i)}
              </div>
            </div>
          </details>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background px-4 py-3.5 md:px-5">
        <p className="text-muted-foreground">{t("priceNote")}</p>
        <div className="flex gap-2 max-md:w-full max-md:[&>*]:flex-1">
          <Button type="button" variant="secondary" disabled={!dirty || pending} onClick={() => setDraft(saved)}>
            {t("revert")}
          </Button>
          <Button type="button" disabled={!dirty || pending} onClick={save}>
            {t("saveAll")}
          </Button>
        </div>
      </div>
    </section>
  );
}
