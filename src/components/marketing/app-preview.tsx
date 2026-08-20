import { useTranslations } from "next-intl";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";

/**
 * A stylised screenshot of the coach dashboard, drawn in markup rather than
 * shipped as a PNG so it stays sharp, themable and translatable — every label
 * comes from `marketing.preview.*` so /en never shows Arabic strings inside
 * the mock.
 *
 * Entirely decorative: the whole block is aria-hidden and the real product is
 * one click away behind the hero CTA. Below `sm` it is hidden outright — a
 * squashed fake dashboard reads worse than no dashboard.
 */
const MONO_LABEL = "font-mono text-[8.5px] font-medium uppercase tracking-[0.1em] text-muted-foreground";

const QUEUE = [
  { key: "a", tint: "bg-tint-1" },
  { key: "b", tint: "bg-tint-2" },
  { key: "c", tint: "bg-tint-4" },
  { key: "d", tint: "bg-tint-5" },
] as const;

const KPIS = ["clients", "pending", "mrr", "adherence"] as const;

const SIDEBAR_ITEMS = [
  { key: "clients", badge: "clientsCount", accent: false },
  { key: "forms", badge: "formsCount", accent: true },
  { key: "programs", badge: null, accent: false },
  { key: "invoices", badge: null, accent: false },
] as const;

export function AppPreview() {
  const t = useTranslations("marketing.preview");

  return (
    <div className="mx-auto mt-14 hidden max-w-[1200px] px-4 sm:block" aria-hidden="true">
      <div className="overflow-hidden rounded-t-2xl border border-b-0 border-border">
        {/* Browser chrome. The traffic lights stay start-anchored so they
            mirror with the URL bar rather than splitting across the corners. */}
        <div className="flex h-9 items-center gap-1.5 border-b border-border bg-muted px-3.5">
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <div className="ms-4 flex h-5.5 max-w-[300px] flex-1 items-center rounded-full bg-card px-3 font-mono text-[10.5px] text-muted-foreground">
            {t("url")}
          </div>
        </div>

        <div className="flex h-[420px] bg-background">
          <aside className="hidden w-[210px] shrink-0 flex-col gap-0.5 bg-sidebar p-3 lg:flex">
            <div className="px-2 pb-4 text-sidebar-foreground">
              <CoachlyLockup height={19} onDarkGround />
            </div>
            <div className="flex h-8.5 items-center rounded-md bg-sidebar-accent px-2.5 text-[12.5px] font-medium text-sidebar-foreground">
              {t("sidebar.dashboard")}
            </div>
            {SIDEBAR_ITEMS.map(({ key, badge, accent }) => (
              <div
                key={key}
                className="flex h-8.5 items-center gap-2.5 px-2.5 text-[12.5px] text-sidebar-foreground/60"
              >
                {t(`sidebar.${key}`)}
                {badge ? (
                  accent ? (
                    <span className="ms-auto inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-sidebar-primary px-1.5 font-mono text-[9.5px] font-semibold text-sidebar-primary-foreground">
                      {t(`sidebar.${badge}`)}
                    </span>
                  ) : (
                    <span className="ms-auto font-mono text-[10px] font-medium text-sidebar-foreground/40">
                      {t(`sidebar.${badge}`)}
                    </span>
                  )
                ) : null}
              </div>
            ))}
          </aside>

          <div className="min-w-0 flex-1 p-5">
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {KPIS.map((key) => (
                <div key={key} className="rounded-lg bg-card p-3.5 ring-1 ring-foreground/10">
                  <div className={MONO_LABEL}>{t(`kpi.${key}.label`)}</div>
                  <div
                    className={`mt-1.5 font-mono text-[23px] font-semibold ${
                      key === "pending" ? "text-primary" : ""
                    }`}
                  >
                    {t(`kpi.${key}.value`)}
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
              <div className="border-b border-border px-4 py-3.5 text-[13px] font-semibold">
                {t("queueTitle")}
              </div>
              {QUEUE.map(({ key, tint }) => (
                <div key={key} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${tint}`}
                  >
                    {t(`rows.${key}.initial`)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-semibold">{t(`rows.${key}.name`)}</div>
                    <div className="truncate text-[10.5px] text-muted-foreground">{t(`rows.${key}.what`)}</div>
                  </div>
                  <div className="font-mono text-[9.5px] font-medium text-muted-foreground">
                    {t(`rows.${key}.when`)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
