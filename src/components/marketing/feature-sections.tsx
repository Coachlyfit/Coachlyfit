import { useTranslations } from "next-intl";
import { CoachlyLockup } from "@/components/brand/coachly-lockup";
import { cn } from "@/lib/utils";
import type { SectionContent } from "@/domain/marketing/sections.schema";

/**
 * The three "here's what it actually looks like" sections — forms, progress,
 * invoices — each pairing a text column with a stylised mock of the real
 * screen. The mocks are markup rather than screenshots so they stay sharp,
 * theme-aware and translated. The text column is CMS content; the mock
 * strings come from `marketing.featureSections.*Mock`.
 *
 * All three mocks live here rather than in six files: each is ~40 lines used
 * exactly once, and splitting them would spread one idea across a directory.
 */
const EYEBROW = "font-mono text-[11px] font-medium uppercase tracking-[0.13em] text-primary";

const FORM_FIELDS = ["a", "b", "c", "d", "e"] as const;
// Which mock fields render the "required" chip filled — matches the design's
// first two rows. Index-based so the message keys stay purely about copy.
const REQUIRED_FIELDS = new Set(["a", "b"]);

const INVOICE_LINES = ["a", "b"] as const;
const PROGRESS_STATS = ["workouts", "adherence", "sleep"] as const;

// Twelve weeks of bodyweight from the design mock. Normalised into the
// 400x120 viewBox below rather than hardcoding a path, so the shape stays
// honest to the numbers if they ever change.
const WEIGHTS = [92, 91.2, 90.4, 90.1, 89.2, 88.6, 88.4, 87.5, 86.9, 86.4, 86.1, 85.6];

function sparkline(values: number[]) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const step = 400 / (values.length - 1);
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(100 - ((v - lo) / span) * 82).toFixed(1)}`)
    .join(" ");
  return { line, area: `${line} L400 120 L0 120 Z` };
}

type FeatureRow = SectionContent<"features">["rows"][number];

function TextColumn({ row }: { row: FeatureRow }) {
  return (
    <div>
      {row.eyebrow && <div className={EYEBROW}>{row.eyebrow}</div>}
      <h2 className="mt-4 text-balance text-2xl font-semibold leading-tight tracking-[-0.025em] md:text-4xl">
        {row.title}
      </h2>
      <p className="mt-4 max-w-[46ch] text-pretty leading-relaxed text-muted-foreground">{row.body}</p>
      <ul className="mt-6 flex flex-col gap-3">
        {row.bullets.map((bullet, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="text-primary" aria-hidden="true">
              —
            </span>
            <span className="text-[14.5px] leading-relaxed">{bullet.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Shared frame for the three mocks: a tinted panel holding a white card. */
function MockPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted p-5 ring-1 ring-foreground/10 sm:p-7" aria-hidden="true">
      {children}
    </div>
  );
}

function FormsMock() {
  const t = useTranslations("marketing.featureSections.formsMock");

  return (
    <MockPanel>
      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <div className="text-[13.5px] font-semibold">{t("title")}</div>
          <span className="ms-auto font-mono text-[10px] font-medium text-primary">{t("addField")}</span>
        </div>
        <div className="p-2">
          {FORM_FIELDS.map((key) => {
            const required = REQUIRED_FIELDS.has(key);
            return (
              <div
                key={key}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 ${key === "b" ? "bg-muted/60" : ""}`}
              >
                <div className="flex shrink-0 flex-col gap-0.5">
                  <span className="block h-px w-2.5 bg-border" />
                  <span className="block h-px w-2.5 bg-border" />
                  <span className="block h-px w-2.5 bg-border" />
                </div>
                <span className="flex-1 truncate text-[12.5px] font-medium">{t(`fields.${key}.label`)}</span>
                <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                  {t(`fields.${key}.type`)}
                </span>
                <span
                  className={`rounded border px-1.5 py-0.5 font-mono text-[9.5px] font-medium ${
                    required
                      ? "border-accent-tint-foreground/30 bg-accent-tint text-accent-tint-foreground"
                      : "border-border bg-card text-muted-foreground/50"
                  }`}
                >
                  {t("required")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </MockPanel>
  );
}

function ProgressMock() {
  const t = useTranslations("marketing.featureSections.progressMock");
  const { line, area } = sparkline(WEIGHTS);

  return (
    <MockPanel>
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex size-9.5 shrink-0 items-center justify-center rounded-full bg-tint-1 text-[15px] font-semibold text-white">
            {t("initial")}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{t("name")}</div>
            <div className="truncate text-[11.5px] text-muted-foreground">{t("meta")}</div>
          </div>
          <div className="font-mono text-[19px] font-semibold text-success">{t("delta")}</div>
        </div>

        <svg viewBox="0 0 400 120" className="h-30 w-full" fill="none" preserveAspectRatio="none">
          <path d="M0 26 H400 M0 60 H400 M0 94 H400" stroke="currentColor" className="text-border" strokeWidth="1" />
          <path d={area} className="fill-primary/10" />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            className="text-primary"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>

        <div className="mt-2.5 flex justify-between font-mono text-[10px] font-medium text-muted-foreground">
          <span>{t("axisStart")}</span>
          <span>{t("axisMid")}</span>
          <span>{t("axisEnd")}</span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {PROGRESS_STATS.map((key) => (
            <div key={key} className="rounded-lg bg-muted/60 py-2.5 text-center">
              <div className="font-mono text-[15px] font-semibold">{t(`stats.${key}.value`)}</div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground">{t(`stats.${key}.label`)}</div>
            </div>
          ))}
        </div>
      </div>
    </MockPanel>
  );
}

function InvoiceMock() {
  const t = useTranslations("marketing.featureSections.invoiceMock");

  return (
    <MockPanel>
      <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
        <div className="mb-5 flex items-start justify-between gap-4">
          <CoachlyLockup height={24} />
          <div className="text-end">
            <div className="text-lg font-semibold">{t("heading")}</div>
            <div className="mt-1 font-mono text-[10.5px] font-medium text-muted-foreground">{t("number")}</div>
          </div>
        </div>
        <div className="mb-4 h-0.5 bg-foreground" />
        {INVOICE_LINES.map((key) => (
          <div key={key} className="flex items-center gap-4 border-b border-border py-2.5">
            <span className="flex-1 text-[12.5px]">{t(`lines.${key}.item`)}</span>
            <span className="font-mono text-[12.5px] font-medium">{t(`lines.${key}.amount`)}</span>
          </div>
        ))}
        <div className="mt-2.5 flex items-baseline justify-between gap-4 border-t border-foreground pt-4">
          <span className="text-[13.5px] font-semibold">{t("totalLabel")}</span>
          <span className="font-mono text-xl font-semibold text-primary">
            {t("totalAmount")} <span className="text-xs">{t("currency")}</span>
          </span>
        </div>
      </div>
    </MockPanel>
  );
}

const ROW = "mx-auto grid max-w-[1200px] items-center gap-10 px-4 lg:grid-cols-2 lg:gap-16";

// The mocks are drawn for the three seeded rows, in this order. A fourth row
// starts the cycle again rather than rendering without a picture.
const MOCKS = [FormsMock, ProgressMock, InvoiceMock];

export function FeatureSections({ content }: { content: SectionContent<"features"> }) {
  return (
    <div className="flex flex-col gap-20 py-20 sm:gap-24 sm:py-24">
      {content.rows.map((row, i) => {
        const Mock = MOCKS[i % MOCKS.length];
        // Every other row flips on desktop only — on mobile every row stays
        // text-then-mock so the reading order never inverts.
        const flipped = i % 2 === 1;
        return (
          <section key={i} id={i === 0 ? "features" : undefined} className={ROW}>
            <div className={cn(flipped && "lg:order-2")}>
              <TextColumn row={row} />
            </div>
            <div className={cn(flipped && "lg:order-1")}>
              <Mock />
            </div>
          </section>
        );
      })}
    </div>
  );
}
