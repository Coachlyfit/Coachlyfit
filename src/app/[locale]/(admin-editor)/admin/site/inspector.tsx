"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { SectionPatch } from "@/domain/marketing/marketing.service";
import {
  BACKGROUNDS,
  IMAGE_POSITIONS,
  emptyContent,
  type Section,
  type SectionSettings,
} from "@/domain/marketing/sections.schema";
import { ImageField } from "./image-field";

type Path = (string | number)[];

// Matches the cap in sections.schema.ts.
const MAX_ITEMS = 12;
// Fields that hold a sentence or more get a textarea.
const LONG_FIELDS = new Set(["subtitle", "body", "quote", "a"]);

// How each ground looks, for its swatch button. Same classes SectionView uses.
const SWATCH: Record<SectionSettings["background"], string> = {
  navy: "dark bg-card text-foreground",
  white: "bg-background text-foreground",
  muted: "bg-muted text-foreground",
};

function getIn(value: unknown, path: Path): unknown {
  return path.reduce<unknown>((node, key) => (node as Record<string | number, unknown> | undefined)?.[key], value);
}

/** Copy of `value` with `update` applied to whatever sits at `path`. A path
 * that doesn't exist in this copy (a list item the other language lacks) is
 * left alone. */
function updateIn<T>(value: T, path: Path, update: (node: unknown) => unknown): T {
  if (path.length === 0) return update(value) as T;
  const copy = structuredClone(value);
  const parent = getIn(copy, path.slice(0, -1)) as Record<string | number, unknown> | undefined;
  const key = path[path.length - 1];
  if (parent && key in parent) parent[key] = update(parent[key]);
  return copy;
}

/** The fields of one section, in the language being previewed, with the other
 * language's text under each one.
 *
 * Plain controlled inputs over the draft rather than a react-hook-form form:
 * there is no submit, every keystroke is the draft (the preview shows it and
 * the autosave sends it), and lists are added to and removed from in both
 * languages at once. A second copy of the values in a form would only have
 * to be kept in step with that. The zod schemas still validate, on save.
 *
 * The inputs are bound to a local copy of the section, not to the query
 * cache: the cache tells its observers about a change asynchronously, and a
 * controlled input that gets its new value a tick late drops characters and
 * breaks IME composition. The parent remounts this (by key) whenever the
 * server's copy replaces the draft. */
export function Inspector({
  section: initialSection,
  locale,
  imageFolder,
  onChange,
  onDelete,
  onClose,
}: {
  section: Section;
  locale: AppLocale;
  imageFolder: string;
  onChange: (patch: SectionPatch) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("admin.site");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [section, setSection] = useState(initialSection);
  const change = (patch: SectionPatch) => {
    setSection((current) => ({ ...current, ...patch }) as Section);
    onChange(patch);
  };

  const other: AppLocale = locale === "ar" ? "en" : "ar";
  const key = `content_${locale}` as const;
  const otherKey = `content_${other}` as const;
  const content: unknown = section[key];
  const otherContent: unknown = section[otherKey];

  const setText = (path: Path, text: string) => change({ [key]: updateIn(content, path, () => text) });

  // A list has the same items in both languages, so both are changed together.
  const changeList = (path: Path, update: (items: unknown[]) => unknown[]) => {
    const apply = (node: unknown) => (Array.isArray(node) ? update(node) : node);
    change({ content_ar: updateIn(section.content_ar, path, apply), content_en: updateIn(section.content_en, path, apply) });
  };

  const addItem = (path: Path) => {
    // The blank item for this list, from the type's empty content. Indexes in
    // the path become 0: the template has one item per list.
    const blank = getIn(emptyContent(section.type), [...path.map((k) => (typeof k === "number" ? 0 : k)), 0]);
    changeList(path, (items) => [...items, structuredClone(blank)]);
  };

  const setSettings = (patch: Partial<SectionSettings>) => change({ settings: { ...section.settings, ...patch } });

  function renderNode(node: unknown, path: Path): React.ReactNode {
    const name = String(path.findLast((k) => typeof k === "string"));

    if (typeof node === "string") {
      const otherText = getIn(otherContent, path);
      const hasOther = typeof otherText === "string" && otherText.trim() !== "";
      const Control = LONG_FIELDS.has(name) ? Textarea : Input;
      return (
        <div key={path.join(".")} className="flex flex-col gap-1.5">
          <label className="flex flex-col gap-1.5 font-medium">
            <span>
              {t(`fields.${name}`)} <span className="font-normal text-muted-foreground">({t(`languages.${locale}`)})</span>
            </span>
            <Control
              value={node}
              dir={locale === "ar" ? "rtl" : "ltr"}
              className="font-normal"
              onChange={(e) => setText(path, e.target.value)}
            />
          </label>
          {hasOther ? (
            <div className="flex items-start gap-2 rounded-[10px] bg-muted/60 px-3 py-2">
              <span className="rounded-md bg-success-tint px-1.5 font-mono text-xs font-medium text-success-tint-foreground uppercase">
                {other}
              </span>
              <span dir={other === "ar" ? "rtl" : "ltr"} className="min-w-0 flex-1 text-muted-foreground">
                {otherText}
              </span>
            </div>
          ) : (
            node.trim() !== "" && (
              <span className="self-start rounded-full bg-warning-tint px-2.5 py-0.5 text-xs font-medium text-warning-tint-foreground">
                {t("inspector.missingTranslation", { language: t(`languages.${other}`) })}
              </span>
            )
          )}
        </div>
      );
    }

    if (Array.isArray(node)) {
      return (
        <fieldset key={path.join(".")} className="flex flex-col gap-2.5">
          <legend className="mb-1.5 font-medium">{t(`fields.${name}`)}</legend>
          {node.map((item, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-[10px] p-3 ring-1 ring-border ring-inset">
              <div className="flex items-center">
                <span className="flex-1 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("inspector.removeItem", { number: i + 1 })}
                  className="text-destructive hover:text-destructive"
                  onClick={() => changeList(path, (items) => items.filter((_, index) => index !== i))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
              {renderNode(item, [...path, i])}
            </div>
          ))}
          <Button type="button" variant="outline" disabled={node.length >= MAX_ITEMS} onClick={() => addItem(path)}>
            <Plus className="size-4" aria-hidden="true" />
            {t("inspector.addItem")}
          </Button>
        </fieldset>
      );
    }

    if (node && typeof node === "object") {
      return Object.entries(node).map(([childKey, child]) => renderNode(child, [...path, childKey]));
    }
    return null;
  }

  const isHero = section.type === "hero";
  const fields = renderNode(content, []);

  return (
    <aside
      aria-label={t("inspector.title")}
      className="flex shrink-0 flex-col gap-4 border-border bg-card p-5 lg:w-[340px] lg:overflow-y-auto lg:border-s"
    >
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">{t(`types.${section.type}`)}</h2>
        <Button type="button" variant="secondary" size="icon" aria-label={t("inspector.close")} onClick={onClose}>
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      {Array.isArray(fields) && fields.length === 0 ? (
        <p className="rounded-[10px] bg-muted/60 p-3 text-muted-foreground">{t("inspector.noFields")}</p>
      ) : (
        fields
      )}

      <div className="flex flex-col gap-1.5">
        <span className="font-medium">{t("inspector.background")}</span>
        <div role="group" aria-label={t("inspector.background")} className="grid grid-cols-3 gap-2">
          {BACKGROUNDS.map((background) => (
            <button
              key={background}
              type="button"
              aria-pressed={section.settings.background === background}
              onClick={() => setSettings({ background })}
              className={cn(
                "min-h-11 rounded-[10px] text-[13px] ring-1 ring-border outline-none ring-inset focus-visible:ring-3 focus-visible:ring-ring/50",
                SWATCH[background],
                section.settings.background === background && "ring-2 ring-primary"
              )}
            >
              {t(`backgrounds.${background}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Only the hero has an image slot today. */}
      {isHero && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="font-medium">{t("inspector.imagePosition")}</span>
            <div role="group" aria-label={t("inspector.imagePosition")} className="grid grid-cols-2 gap-2">
              {IMAGE_POSITIONS.map((position) => {
                const active = section.settings.image_position === position;
                return (
                  <button
                    key={position}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSettings({ image_position: position })}
                    className={cn(
                      "min-h-11 rounded-[10px] text-[13px] ring-1 ring-border outline-none ring-inset focus-visible:ring-3 focus-visible:ring-ring/50",
                      active && "bg-accent-tint text-accent-tint-foreground ring-2 ring-primary"
                    )}
                  >
                    {t(`imagePositions.${position}`)}
                  </button>
                );
              })}
            </div>
          </div>
          <ImageField
            folder={imageFolder}
            path={section.settings.image_path}
            onChange={(image_path) => setSettings({ image_path })}
          />
        </>
      )}

      <label className="flex min-h-11 items-center gap-2.5 font-medium">
        <Checkbox checked={section.is_visible} onCheckedChange={(checked) => change({ is_visible: checked })} />
        {t("inspector.visible")}
      </label>

      <Button
        type="button"
        variant="ghost"
        className="justify-start text-destructive hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {t("inspector.delete")}
      </Button>

      <p className="mt-auto rounded-[10px] bg-muted/60 p-3 text-muted-foreground">{t("inspector.hint")}</p>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("inspector.deleteTitle", { name: t(`types.${section.type}`) })}
        description={t("inspector.deleteDescription")}
        confirmLabel={t("inspector.delete")}
        onConfirm={() => {
          setConfirmDelete(false);
          onDelete();
        }}
      />
    </aside>
  );
}
