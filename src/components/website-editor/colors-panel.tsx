"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  emptyPalette,
  PALETTE_KEYS,
  PALETTE_TOKEN,
  resolveTokens,
  type Palette,
  type PaletteKey,
  type Scheme,
  type SiteTheme,
} from "@/domain/sites/palette";
import { normalizeHex } from "@/lib/brand-theme";

function ColorRow({
  name,
  hint,
  picked,
  resolved,
  onPick,
  onReset,
}: {
  name: string;
  hint?: string;
  /** The coach's pick, or null while it's automatic. */
  picked: string | null;
  /** What the site is using right now (the pick, or the automatic color). */
  resolved: string;
  onPick: (hex: string) => void;
  onReset: () => void;
}) {
  const t = useTranslations("websiteEditor.colors");
  const id = useId();
  const [text, setText] = useState(picked ?? "");
  useEffect(() => setText(picked ?? ""), [picked]);

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`${id}-hex`} className="text-sm font-medium">
          {name}
        </label>
        {picked === null && <span className="text-xs text-muted-foreground">{t("automatic")}</span>}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={picked ?? resolved}
          onChange={(e) => onPick(e.target.value)}
          aria-label={t("pick", { name })}
          className="size-11 shrink-0 cursor-pointer rounded-lg border border-input bg-transparent p-1"
        />
        <Input
          id={`${id}-hex`}
          dir="ltr"
          className="font-mono"
          value={text}
          placeholder={resolved}
          maxLength={7}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onChange={(e) => {
            setText(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) onPick(hex);
          }}
          onBlur={() => setText(picked ?? "")}
        />
        {picked !== null && (
          <Button type="button" variant="ghost" size="sm" className="min-h-11 shrink-0" onClick={onReset}>
            {t("reset")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Every color on the site, separately for light and dark. Anything left on
 * "Automatic" follows the brand colors; picks are checked for readability and
 * nudged if needed (with a note). The palette being edited is also the
 * preview's scheme, so what you change is what you see. */
export function ColorsPanel({
  theme,
  base,
  scheme,
  onSchemeChange,
  onChange,
}: {
  theme: SiteTheme;
  /** Brand primary/accent that automatic colors derive from. */
  base: { p: string; a: string };
  scheme: Scheme;
  onSchemeChange: (scheme: Scheme) => void;
  onChange: (theme: SiteTheme) => void;
}) {
  const t = useTranslations("websiteEditor.colors");
  const uid = useId();
  const palette = theme[scheme];
  const { tokens, adjusted } = resolveTokens(scheme, base, palette);

  const setPalette = (next: Palette) => onChange({ ...theme, [scheme]: next });
  const setKey = (key: PaletteKey, value: string | null) => setPalette({ ...palette, [key]: value });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("mode.label")}</legend>
        {(["auto", "light", "dark"] as const).map((mode) => (
          <label
            key={mode}
            className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl p-3 ring-1 ring-foreground/10 has-[:checked]:bg-accent-tint has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
          >
            <input
              type="radio"
              name={`${uid}-mode`}
              className="mt-1 size-4 accent-primary"
              checked={theme.mode === mode}
              onChange={() => onChange({ ...theme, mode })}
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{t(`mode.${mode}`)}</span>
              {mode === "auto" && <span className="text-sm text-muted-foreground">{t("mode.autoHint")}</span>}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={`${uid}-scheme`} className="text-sm font-medium">
          {t("palette.label")}
        </span>
        <div role="group" aria-labelledby={`${uid}-scheme`} className="flex gap-1">
          {(["light", "dark"] as const).map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={scheme === s ? "secondary" : "ghost"}
              className="min-h-11"
              aria-pressed={scheme === s}
              onClick={() => onSchemeChange(s)}
            >
              {t(`palette.${s}`)}
            </Button>
          ))}
        </div>
      </div>

      {adjusted && (
        <p className="rounded-xl bg-warning-tint p-3 text-sm text-warning-tint-foreground" role="status">
          {t("adjusted")}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {PALETTE_KEYS.map((key) => (
          <ColorRow
            key={`${scheme}-${key}`}
            name={t(`fields.${key}.label`)}
            hint={t.has(`fields.${key}.hint`) ? t(`fields.${key}.hint`) : undefined}
            picked={palette[key]}
            resolved={tokens[PALETTE_TOKEN[key]]}
            onPick={(hex) => setKey(key, hex)}
            onReset={() => setKey(key, null)}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        className="min-h-11 self-start"
        disabled={PALETTE_KEYS.every((k) => palette[k] === null)}
        onClick={() => setPalette(emptyPalette())}
      >
        {t("resetAll", { scheme: t(`palette.${scheme}`) })}
      </Button>
    </div>
  );
}
