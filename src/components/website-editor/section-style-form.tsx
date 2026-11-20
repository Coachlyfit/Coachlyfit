"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  emptyStyle,
  isStyled,
  STYLE_LIMITS,
  type ColorField,
  type SectionStyle,
  type SizeField,
  type StyleScheme,
} from "@/domain/sites/section-style";
import { contrast, normalizeHex } from "@/lib/brand-theme";

const COLOR_FIELDS: ColorField[] = ["bg", "text", "heading"];
const SIZE_FIELDS: { field: SizeField; limits: { min: number; max: number } }[] = [
  { field: "headingSize", limits: STYLE_LIMITS.headingSize },
  { field: "bodySize", limits: STYLE_LIMITS.bodySize },
  { field: "paddingTop", limits: STYLE_LIMITS.padding },
  { field: "paddingBottom", limits: STYLE_LIMITS.padding },
];

/** Shown in the swatch while nothing is picked; never saved. */
const SWATCH_FALLBACK = "#808080";

const split = (value: string | null): { hex: string; opacity: number } =>
  value
    ? { hex: value.slice(0, 7), opacity: value.length === 9 ? Math.round((parseInt(value.slice(7), 16) / 255) * 100) : 100 }
    : { hex: SWATCH_FALLBACK, opacity: 100 };

const join = (hex: string, opacity: number) =>
  opacity >= 100 ? hex : `${hex}${Math.round((opacity / 100) * 255).toString(16).padStart(2, "0")}`;

function ColorRow({
  name,
  value,
  onChange,
}: {
  name: string;
  /** #rrggbb or #rrggbbaa, or null while it's the site's default. */
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const t = useTranslations("websiteEditor.style");
  const id = useId();
  const { hex, opacity } = split(value);
  const [text, setText] = useState(value ? hex : "");
  // Re-sync the field when the value changes from outside (reset).
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value ? hex : "");
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={`${id}-hex`}>{name}</Label>
        {value === null && <span className="text-xs text-muted-foreground">{t("default")}</span>}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(join(e.target.value, opacity))}
          aria-label={t("pick", { name })}
          className="size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
        />
        <Input
          id={`${id}-hex`}
          dir="ltr"
          className="font-mono"
          value={text}
          placeholder={t("default")}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value);
            const next = normalizeHex(e.target.value);
            if (next) onChange(join(next, opacity));
          }}
          onBlur={() => setText(value ? hex : "")}
        />
        {value !== null && (
          <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => onChange(null)}>
            {t("reset")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-3" dir="ltr">
        <span id={`${id}-op`} className="w-20 shrink-0 text-sm text-muted-foreground" dir="auto">
          {t("opacity")}
        </span>
        <Slider
          aria-labelledby={`${id}-op`}
          min={0}
          max={100}
          step={1}
          disabled={value === null}
          value={[opacity]}
          onValueChange={(v) => onChange(join(hex, Array.isArray(v) ? v[0] : (v as number)))}
        />
        <span className="w-10 shrink-0 text-end font-mono text-sm tabular-nums">{opacity}%</span>
      </div>
    </div>
  );
}

function SizeRow({
  name,
  value,
  limits,
  onChange,
}: {
  name: string;
  value: number | null;
  limits: { min: number; max: number };
  onChange: (value: number | null) => void;
}) {
  const t = useTranslations("websiteEditor.style");
  const id = useId();
  const [text, setText] = useState(value === null ? "" : String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setText(value === null ? "" : String(value));
  }

  function commit(raw: string) {
    if (raw.trim() === "") return onChange(null);
    const n = Number(raw);
    if (!Number.isFinite(n)) return setText(value === null ? "" : String(value));
    const clamped = Math.min(limits.max, Math.max(limits.min, Math.round(n)));
    setText(String(clamped));
    onChange(clamped);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{name}</Label>
        {value === null && <span className="text-xs text-muted-foreground">{t("default")}</span>}
      </div>
      <div className="flex items-center gap-3" dir="ltr">
        <Slider
          aria-label={name}
          min={limits.min}
          max={limits.max}
          step={1}
          value={[value ?? limits.min]}
          onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))}
        />
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          dir="ltr"
          className="w-20 shrink-0 font-mono"
          min={limits.min}
          max={limits.max}
          value={text}
          placeholder={t("default")}
          onChange={(e) => {
            setText(e.target.value);
            const n = Number(e.target.value);
            // Applied live while the typed number is in range; out-of-range
            // text waits for blur, where it is clamped.
            if (e.target.value.trim() !== "" && Number.isInteger(n) && n >= limits.min && n <= limits.max) onChange(n);
          }}
          onBlur={(e) => commit(e.target.value)}
        />
        <span className="w-6 shrink-0 text-sm text-muted-foreground">{t("px")}</span>
        {value !== null && (
          <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={() => onChange(null)}>
            {t("reset")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Colors, sizes and spacing for ONE section. Every field starts on the site's
 * default (null); picks apply to the scheme the preview is showing, so light
 * and dark can differ. Edits go through `onChange` like every other form, so
 * they use the editor's one autosave. */
export function SectionStyleForm({
  style,
  scheme,
  onChange,
}: {
  style: SectionStyle | undefined;
  scheme: StyleScheme;
  onChange: (style: SectionStyle) => void;
}) {
  const t = useTranslations("websiteEditor.style");
  const tp = useTranslations("websiteEditor.preview");
  const current = style ?? emptyStyle();

  const setColor = (field: ColorField, value: string | null) =>
    onChange({ ...current, [field]: { ...current[field], [scheme]: value } });
  const setSize = (field: SizeField, value: number | null) => onChange({ ...current, [field]: value });

  const bg = current.bg[scheme];
  const text = current.text[scheme];
  const lowContrast = bg !== null && text !== null && contrast(bg.slice(0, 7), text.slice(0, 7)) < 4.5;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      <section className="flex flex-col gap-3" aria-labelledby="style-colors">
        <h3 id="style-colors" className="text-sm font-semibold">
          {t("colors.title")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("scheme", { scheme: tp(scheme) })}</p>
        {lowContrast && (
          <p className="rounded-xl bg-warning-tint p-3 text-sm text-warning-tint-foreground" role="status">
            {t("lowContrast")}
          </p>
        )}
        {COLOR_FIELDS.map((field) => (
          <ColorRow
            key={`${field}-${scheme}`}
            name={t(`colors.${field}`)}
            value={current[field][scheme]}
            onChange={(v) => setColor(field, v)}
          />
        ))}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="style-sizes">
        <h3 id="style-sizes" className="text-sm font-semibold">
          {t("sizes.title")}
        </h3>
        {SIZE_FIELDS.map(({ field, limits }) => (
          <SizeRow key={field} name={t(`sizes.${field}`)} value={current[field]} limits={limits} onChange={(v) => setSize(field, v)} />
        ))}
      </section>

      <Button type="button" variant="outline" className="min-h-11 self-start" disabled={!isStyled(style)} onClick={() => onChange(emptyStyle())}>
        {t("resetAll")}
      </Button>
    </div>
  );
}
