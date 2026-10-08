"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ChevronDown, ChevronLeft, ChevronUp, Eye, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status-badge";
import { FormRenderer } from "@/components/forms-runtime/form-renderer";
import { Link } from "@/i18n/navigation";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { pickBilingual, type AppLocale } from "@/domain/locale";
import { findPublishIssue } from "@/domain/forms/publish-check";
import type { FormField } from "@/domain/forms/schema";
import { useBuilderStore } from "./builder-store";
import { FIELD_ICONS } from "./field-icons";
import { FieldPalette } from "./field-palette";
import { Canvas } from "./canvas";
import { Inspector } from "./inspector";

type ActionResult = Promise<{ error: string } | void>;
type Names = { name_ar: string; name_en: string };

/** Drafts used to live here before they were saved on the server; read once
 * so an edit made before that change isn't lost, then dropped. */
function legacyDraftKey(templateId: string) {
  return `form-draft:${templateId}`;
}

const PANEL = "rounded-xl bg-card p-4 ring-1 ring-foreground/10";
const PINNED =
  "fixed start-4 end-20 bottom-[calc(var(--bottom-nav-h)+0.75rem)] z-30 h-13 text-base shadow-lg lg:hidden";

export function Builder({
  locale,
  templateId,
  initialFields,
  initialNames,
  kindLabel,
  kindTint,
  published,
  initialHasDraft,
  assign,
  onPublish,
  onSaveDraft,
  onRename,
}: {
  locale: AppLocale;
  templateId: string;
  initialFields: FormField[];
  initialNames: Names;
  kindLabel: string;
  /** Tint-pair classes for the kind badge. */
  kindTint: string;
  published: boolean;
  /** The template already carries edits saved since its last publish. */
  initialHasDraft: boolean;
  /** The "assign to client" control, owned by the route. */
  assign: React.ReactNode;
  onPublish: (fields: FormField[]) => ActionResult;
  onSaveDraft: (fields: FormField[]) => ActionResult;
  onRename: (names: Names) => ActionResult;
}) {
  const t = useTranslations("forms.builder");
  const tStatus = useTranslations("forms.list.status");
  const tTypes = useTranslations("forms.builder.fieldTypes");
  const tFill = useTranslations("forms.fill");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("forms.errors");
  const fields = useBuilderStore((s) => s.fields);
  const load = useBuilderStore((s) => s.load);
  const selectedId = useBuilderStore((s) => s.selectedId);
  const select = useBuilderStore((s) => s.select);
  const removeField = useBuilderStore((s) => s.removeField);
  const moveField = useBuilderStore((s) => s.moveField);

  const nameKey = locale === "ar" ? "name_ar" : "name_en";
  const [names, setNames] = useState(initialNames);
  const [title, setTitle] = useState(initialNames[nameKey]);
  const [preview, setPreview] = useState(false);
  // Mobile only: which bottom sheet is open. Desktop never sets it.
  const [sheet, setSheet] = useState<"add" | "edit" | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [unpublished, setUnpublished] = useState(initialHasDraft);
  const [publishing, startPublish] = useTransition();
  const [, startRename] = useTransition();
  const loadedRef = useRef(false);
  // What the server currently holds, so an unchanged form is never re-saved.
  const savedRef = useRef(JSON.stringify(initialFields));

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const raw = window.localStorage.getItem(legacyDraftKey(templateId));
    if (raw) {
      window.localStorage.removeItem(legacyDraftKey(templateId));
      try {
        // Differs from savedRef, so the autosave below sends it to the server.
        load(JSON.parse(raw) as FormField[]);
        return;
      } catch {
        // fall through to initialFields
      }
    }
    load(initialFields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  // Debounced autosave of the draft.
  // ponytail: an edit made in the last 0.8s before leaving the page is not
  // flushed; add a flush on unmount / pagehide if that ever bites.
  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(async () => {
      const json = JSON.stringify(fields);
      if (json === savedRef.current) return;
      setSaveState("saving");
      const result = await onSaveDraft(fields);
      if (result?.error) {
        setSaveState("error");
        return;
      }
      savedRef.current = json;
      setSaveState("saved");
      setUnpublished(true);
    }, 800);
    return () => clearTimeout(timer);
  }, [fields, onSaveDraft]);

  function handlePublish() {
    const issue = findPublishIssue(fields);
    if (issue) {
      toast.error(tErrors(`publish_${issue.code}`));
      if ("fieldId" in issue) {
        setPreview(false);
        select(issue.fieldId);
      }
      return;
    }
    startPublish(async () => {
      const result = await onPublish(fields);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      // Publishing clears the server draft; a pending autosave must not
      // write the same content back as a new one.
      savedRef.current = JSON.stringify(fields);
      setSaveState("saved");
      setUnpublished(false);
      toast.success(t("published"));
    });
  }

  function commitTitle() {
    const next = title.trim();
    // The Arabic name is the required one; the English one may be cleared.
    if (next === names[nameKey] || (nameKey === "name_ar" && !next)) {
      setTitle(names[nameKey]);
      return;
    }
    const updated = { ...names, [nameKey]: next };
    startRename(async () => {
      const result = await onRename(updated);
      if (result?.error) {
        toast.error(tErrors(result.error));
        setTitle(names[nameKey]);
        return;
      }
      setNames(updated);
      setTitle(next);
    });
  }

  const displayName = title.trim() || names.name_ar || names.name_en;
  const questions = fields.filter((f) => f.type !== "section");
  const selected = fields.find((f) => f.id === selectedId);
  const selectedIndex = selected ? fields.indexOf(selected) : -1;
  const num = (chunks: React.ReactNode) => <span className="font-mono tabular-nums">{chunks}</span>;

  return (
    <div className="flex flex-col gap-4 max-lg:pb-20">
      <header className={cn(PANEL, "flex flex-wrap items-center gap-x-4 gap-y-2.5 p-2.5")}>
        <Link
          href="/forms"
          aria-label={t("back")}
          className={buttonVariants({ variant: "outline", size: "icon" })}
        >
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden="true" />
        </Link>
        <div className="flex min-w-0 flex-[1_1_260px] flex-col leading-snug">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              aria-label={t("nameLabel")}
              placeholder={names.name_ar}
              maxLength={100}
              className="w-56 max-w-full min-w-0 rounded-md bg-transparent text-xl font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 max-lg:text-base"
            />
            <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", kindTint)}>{kindLabel}</span>
            {published ? (
              <StatusBadge tone="success">{tStatus("published")}</StatusBadge>
            ) : (
              <Badge className="rounded-md bg-muted text-foreground">{tStatus("draft")}</Badge>
            )}
            {published && unpublished && <StatusBadge tone="warning">{tStatus("unpublishedChanges")}</StatusBadge>}
          </div>
          <span className="flex flex-wrap items-center gap-1.5 text-muted-foreground">
            <span
              className={cn("size-1.75 rounded-full", saveState === "error" ? "bg-destructive" : "bg-success")}
              aria-hidden="true"
            />
            <span role="status">
              {t(saveState === "saving" ? "saving" : saveState === "error" ? "saveFailed" : "autosaved")}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t.rich("questionCount", {
                count: questions.length,
                value: formatNumber(questions.length, locale),
                num,
              })}
            </span>
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={preview ? "default" : "outline"}
            aria-pressed={preview}
            onClick={() => setPreview((p) => !p)}
          >
            <Eye className="size-4" aria-hidden="true" />
            {t("preview")}
          </Button>
          {assign}
          <Button type="button" onClick={handlePublish} disabled={publishing} className="min-w-24 px-5">
            {publishing ? tCommon("pending") : t("publish")}
          </Button>
        </div>
      </header>

      {preview ? (
        <div className={cn(PANEL, "mx-auto flex w-full max-w-105 flex-col gap-4 rounded-[18px] p-6")}>
          <div className="border-b border-border pb-2 text-xl font-semibold">{displayName}</div>
          <FormRenderer fields={fields} mode="preview" />
          {/* What the client's submit looks like; it does nothing here. */}
          <Button type="button" size="lg" tabIndex={-1} aria-disabled="true" className="pointer-events-none">
            {tFill("submit")}
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-4 max-lg:hidden">
            <aside aria-label={t("paletteTitle")} className={cn(PANEL, "flex w-60 shrink-0 flex-col gap-3.5 p-3.5")}>
              <span className="font-semibold">{t("paletteTitle")}</span>
              <FieldPalette />
            </aside>
            <Canvas title={displayName} />
            <aside aria-label={t("inspector.title")} className={cn(PANEL, "w-80 shrink-0")}>
              {selected ? (
                <Inspector />
              ) : (
                <p className="py-6 text-center text-muted-foreground">{t("inspector.empty")}</p>
              )}
            </aside>
          </div>

          {/* Below lg the three columns don't fit: a list of questions, each
              opening the edit sheet, and one pinned button to add. */}
          <div className="flex flex-col gap-2 lg:hidden">
            {fields.length === 0 && (
              <div className="flex flex-col gap-1 rounded-xl border-[1.5px] border-dashed border-muted-foreground/40 px-4 py-10 text-center">
                <span className="font-semibold">{t("canvasEmptyTitle")}</span>
                <span className="text-muted-foreground">{t("canvasEmptyMobile")}</span>
              </div>
            )}
            {fields.map((field) => {
              const Icon = FIELD_ICONS[field.type];
              const label = pickBilingual(field.label, locale);
              return (
                <button
                  key={field.id}
                  type="button"
                  onClick={() => {
                    select(field.id);
                    setSheet("edit");
                  }}
                  className="flex min-h-16 w-full items-center gap-3 rounded-xl bg-card p-3 text-start ring-1 ring-foreground/10 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-tint text-accent-tint-foreground">
                    <Icon className="size-4.5" aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-snug">
                    <span className={cn("truncate font-semibold", !label && "text-muted-foreground")}>
                      {label || t("untitled")}
                      {field.required && <span className="text-destructive"> *</span>}
                    </span>
                    <span className="text-[0.8125rem] text-muted-foreground">{tTypes(field.type)}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <Button type="button" className={PINNED} onClick={() => setSheet("add")}>
            <Plus className="size-4" aria-hidden="true" />
            {t("paletteTitle")}
          </Button>
        </>
      )}

      <Sheet open={sheet === "add"} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{t("questionType")}</SheetTitle>
          </SheetHeader>
          <FieldPalette className="px-4" gridClassName="grid-cols-3" onAdd={() => setSheet("edit")} />
        </SheetContent>
      </Sheet>
      <Sheet open={sheet === "edit" && selected != null} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent side="bottom">
          <SheetHeader>
            <SheetTitle>{t("editQuestion")}</SheetTitle>
          </SheetHeader>
          <Inspector className="px-4" />
          {selected && (
            <div className="flex gap-2 border-t border-border px-4 pt-3">
              <Button
                type="button"
                className="bg-destructive-tint text-destructive-tint-foreground hover:bg-destructive-tint/80"
                onClick={() => {
                  setSheet(null);
                  removeField(selected.id);
                }}
              >
                {t("delete")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("moveUp")}
                disabled={selectedIndex === 0}
                onClick={() => moveField(selected.id, -1)}
              >
                <ChevronUp className="size-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t("moveDown")}
                disabled={selectedIndex === fields.length - 1}
                onClick={() => moveField(selected.id, 1)}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </Button>
              <Button type="button" className="flex-1 text-base" onClick={() => setSheet(null)}>
                {t("done")}
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
