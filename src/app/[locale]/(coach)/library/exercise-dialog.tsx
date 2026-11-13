"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useWatch, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { pickLocale, type AppLocale } from "@/domain/locale";
import {
  SECTION_FIELDS,
  SECTION_IDS,
  exerciseFormSchema,
  firstErrorTarget,
  sectionStatus,
  toFormData,
  toFormValues,
  type ContentLang,
  type ExerciseFormValues,
  type SectionId,
} from "@/domain/library/exercise-form";
import { cn } from "@/lib/utils";
import { createExerciseAction, updateExerciseAction, type searchExercisesAction } from "./actions";
import { BasicsSection, ExtraSection, InstructionsSection, MediaSection } from "./exercise-form-sections";
import { ExercisePreview } from "./exercise-form-preview";
import { DiscardChangesDialog } from "./discard-changes-dialog";

type Exercise = Awaited<ReturnType<typeof searchExercisesAction>>["rows"][number];

type Mode = "create" | "clone" | "edit";

const SECTION_COMPONENTS = {
  basics: BasicsSection,
  media: MediaSection,
  instructions: InstructionsSection,
  extra: ExtraSection,
} as const;

/** Section list: a 4-column tab strip under the header on mobile, a vertical
 * list with subtitle + status tag from md up. Subscribes to the form itself
 * so typing re-renders the nav, not the whole dialog. */
function SectionNav({
  control,
  errorKeys,
  section,
  onSelect,
}: {
  control: Control<ExerciseFormValues>;
  errorKeys: string[];
  section: SectionId;
  onSelect: (id: SectionId) => void;
}) {
  const tf = useTranslations("library.exercise.form");
  const status = sectionStatus(useWatch({ control }) as ExerciseFormValues);

  return (
    <nav
      aria-label={tf("navLabel")}
      className="grid grid-cols-4 border-b md:flex md:flex-col md:gap-1 md:overflow-y-auto md:border-b-0 md:border-e md:p-2.5"
    >
      {SECTION_IDS.map((id, i) => {
        const active = id === section;
        const s = status[id];
        const hasError = SECTION_FIELDS[id].some((f) => errorKeys.includes(f));
        const tag =
          id === "basics"
            ? tf("tagRequired")
            : id === "extra"
              ? tf("tagOptional")
              : tf("filled", { n: s.filled, total: s.total });
        const note = hasError ? tf("sectionHasErrors") : s.bilingualGap ? tf("translationMissing") : null;
        return (
          <button
            key={id}
            type="button"
            aria-current={active ? "step" : undefined}
            onClick={() => onSelect(id)}
            className={cn(
              "relative flex h-12 min-w-0 items-center justify-center gap-2.5 border-b-[3px] border-transparent px-1 text-[13px] text-muted-foreground outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              "md:h-auto md:min-h-15 md:justify-start md:rounded-xl md:border-b-0 md:px-2.5 md:py-2 md:text-start md:text-sm md:text-foreground md:hover:bg-muted",
              active &&
                "border-primary font-semibold text-primary md:bg-accent-tint md:text-accent-tint-foreground md:hover:bg-accent-tint"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "hidden size-7 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold md:flex",
                active && "bg-primary text-primary-foreground",
                hasError && "bg-destructive text-destructive-foreground"
              )}
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-col items-start leading-snug md:flex-1">
              <span className="max-w-full truncate font-semibold">{tf(`sections.${id}.title`)}</span>
              <span className="hidden max-w-full truncate text-xs font-normal text-muted-foreground md:block">
                {tf(`sections.${id}.subtitle`)}
              </span>
              {note && (
                <Badge variant={hasError ? "destructive" : "warning"} className="mt-1 hidden md:inline-flex">
                  {note}
                </Badge>
              )}
            </span>
            <span className="hidden shrink-0 font-mono text-xs text-muted-foreground md:inline">{tag}</span>
            {note && (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute end-2 top-2 size-2 rounded-full md:hidden",
                    hasError ? "bg-destructive" : "bg-warning"
                  )}
                />
                <span className="sr-only md:hidden">{note}</span>
              </>
            )}
          </button>
        );
      })}
      <p className="mt-auto hidden rounded-xl bg-background p-2.5 text-[13px] text-muted-foreground md:block">
        {tf("requiredHint")}
      </p>
    </nav>
  );
}

/** One form for all three ways a coach ends up here — same shape as the
 * admin GlobalExerciseDialog's create/edit split, extended with a third
 * mode. "create" owns its own trigger button and is uncontrolled by
 * default; "clone"/"edit" are always controlled by the caller (a button on
 * an exercise-card/list row), since there's nowhere generic to put their
 * trigger.
 *
 * Four sections (basics / media / instructions / extra) share ONE react-hook-form
 * instance — RHF keeps unmounted fields' values, so switching section or
 * content language never loses input. Layout: full-screen sheet with tabs on
 * mobile; nav + form + live preview from lg up. */
export function ExerciseDialog({
  locale,
  mode,
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  locale: AppLocale;
  mode: Mode;
  /** The row being cloned from ("clone") or edited ("edit"). Unused for
   * "create". */
  item?: Exercise;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSaved: () => void;
}) {
  const t = useTranslations("library.exercise");
  const tf = useTranslations("library.exercise.form");
  const tCommon = useTranslations("common");
  const tLibrary = useTranslations("library");
  const tErrors = useTranslations("library.errors");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [section, setSection] = useState<SectionId>("basics");
  const [lang, setLang] = useState<ContentLang>(locale);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [focusReq, setFocusReq] = useState<{ field: string; n: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isOpen = open ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const idPrefix = `ex_${mode}_`;

  const form = useForm<ExerciseFormValues>({
    resolver: zodResolver(exerciseFormSchema),
    defaultValues: toFormValues(item),
  });
  const { handleSubmit, reset, control, formState } = form;
  const { isDirty, errors } = formState;

  useUnsavedChanges(isOpen && isDirty && !pending, tf("discard.description"));

  // Order matters: scroll to top first, then focus (which scrolls the field in).
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0 });
  }, [section]);
  useEffect(() => {
    if (focusReq) document.getElementById(`${idPrefix}${focusReq.field}`)?.focus();
  }, [focusReq, idPrefix]);

  const resetAll = () => {
    reset(toFormValues(item));
    setSection("basics");
    setLang(locale);
    setFormError(null);
    setFocusReq(null);
  };

  const requestClose = () => {
    if (pending) return;
    if (isDirty) setConfirmOpen(true);
    else setOpen(false);
  };

  const onSubmit = handleSubmit(
    (data) => {
      setFormError(null);
      const formData = toFormData(data, { mode, sourceId: item?.id });
      startTransition(async () => {
        const result =
          mode === "edit" && item
            ? await updateExerciseAction(locale, item.id, formData)
            : await createExerciseAction(locale, formData);
        if (result?.error) {
          setFormError(result.error);
          return;
        }
        // Saved: make the form clean so closing doesn't ask to discard.
        if (mode === "create") resetAll();
        else reset(data);
        setOpen(false);
        onSaved();
      });
    },
    (errs) => {
      // Jump to the first section with an error, in the right language, and focus it.
      const target = firstErrorTarget(Object.keys(errs), lang);
      if (!target) return;
      setSection(target.section);
      setLang(target.lang);
      setFocusReq((prev) => ({ field: target.field, n: (prev?.n ?? 0) + 1 }));
    }
  );

  const title = mode === "edit" ? t("editTitle") : mode === "clone" ? t("cloneTitle") : t("add");
  const submitLabel = mode === "create" ? t("submit") : tf("saveChanges");
  // Reads the CLONE's own source_name_*, not item's own name — that's what
  // survives a rename (20260805000001_library_clone.sql).
  const basedOn =
    mode === "clone" && item
      ? pickLocale(item, locale)
      : mode === "edit" && item?.source_exercise_id
        ? pickLocale(item, locale, "source_name")
        : null;

  const index = SECTION_IDS.indexOf(section);
  const nextSection = SECTION_IDS[index + 1];
  const Section = SECTION_COMPONENTS[section];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        // Esc / outside click while the discard prompt is up cancels the prompt only.
        else if (confirmOpen) setConfirmOpen(false);
        else requestClose();
      }}
    >
      {mode === "create" && (
        <DialogTrigger render={<Button size="sm" />}>
          <Plus className="size-4" />
          {t("add")}
        </DialogTrigger>
      )}
      <DialogContent
        showCloseButton={false}
        className={cn(
          "flex flex-col gap-0 overflow-hidden p-0",
          // Full-screen sheet below md; centered 1080px dialog from md.
          "h-dvh max-h-none max-w-none sm:max-w-none max-md:inset-0 max-md:translate-none max-md:rounded-none",
          "md:h-[min(880px,92dvh)] md:max-w-[min(1080px,calc(100%-2rem))]"
        )}
      >
        <form onSubmit={onSubmit} noValidate inert={confirmOpen} className="flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-3 border-b px-3 py-2 md:min-h-17 md:px-5">
            <div className="flex min-w-0 flex-1 flex-col leading-snug">
              <DialogTitle className="truncate text-[17px] leading-snug font-bold md:text-lg">{title}</DialogTitle>
              <p className={cn("truncate text-sm text-muted-foreground", !basedOn && "max-md:hidden")}>
                {basedOn ? tLibrary("basedOn", { name: basedOn }) : tf("subtitle")}
              </p>
            </div>
            <span className="hidden text-sm text-muted-foreground md:inline">{tf("contentLanguage")}</span>
            <Segmented
              label={tf("contentLanguage")}
              value={lang}
              onChange={setLang}
              options={[
                { value: "ar", label: tf("langAr") },
                { value: "en", label: tf("langEn") },
              ]}
              className="[&>button]:h-11 md:[&>button]:h-9"
            />
            <Button
              type="button"
              variant="ghost"
              aria-label={tf("close")}
              onClick={requestClose}
              className="size-11 shrink-0"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </header>

          <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[230px_minmax(0,1fr)] md:grid-rows-1 lg:grid-cols-[230px_minmax(0,1fr)_320px]">
            <SectionNav control={control} errorKeys={Object.keys(errors)} section={section} onSelect={setSection} />
            <div ref={panelRef} className="min-h-0 overflow-y-auto px-4 py-4 md:px-6 md:py-5">
              <Section form={form} lang={lang} idp={idPrefix} />
            </div>
            <ExercisePreview control={control} lang={lang} />
          </div>

          {formError && (
            <p role="alert" className="shrink-0 border-t bg-destructive-tint px-4 py-2 text-sm text-destructive-tint-foreground">
              {tErrors.has(formError) ? tErrors(formError) : tErrors("unknown")}
            </p>
          )}

          <footer className="flex shrink-0 items-center gap-2 border-t px-3 py-3 md:h-19 md:px-5">
            <span className="me-auto hidden text-sm text-muted-foreground md:block">
              {tf.rich("sectionOf", {
                n: index + 1,
                total: SECTION_IDS.length,
                num: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </span>
            <Button type="button" variant="ghost" onClick={requestClose} className="hidden h-11 md:inline-flex">
              {tCommon("cancel")}
            </Button>
            {nextSection && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setSection(nextSection)}
                className="h-11 max-md:flex-1 md:px-4"
              >
                {tf("next", { section: tf(`sections.${nextSection}.title`) })}
              </Button>
            )}
            <Button type="submit" disabled={pending} className="h-11 min-w-24 max-md:flex-1 md:px-5">
              {pending ? tCommon("pending") : submitLabel}
            </Button>
          </footer>
        </form>

        <DiscardChangesDialog
          open={confirmOpen}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            resetAll();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
