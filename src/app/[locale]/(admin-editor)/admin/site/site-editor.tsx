"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Monitor, Smartphone, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AppLocale } from "@/domain/locale";
import type { PageVersion, SectionPatch } from "@/domain/marketing/marketing.service";
import type { Section, SectionType } from "@/domain/marketing/sections.schema";
import type { PublishIssue } from "@/domain/marketing/snapshot";
import {
  addSectionAction,
  deleteSectionAction,
  getDraftAction,
  publishAction,
  reorderSectionsAction,
  saveSectionAction,
} from "./actions";
import { useEditorStore, type PreviewDevice } from "./editor-store";
import { Inspector } from "./inspector";
import { SectionList } from "./section-list";
import { VersionSheet, versionsKey } from "./version-sheet";
import type { PreviewMessage } from "./preview/preview-client";

// The preview frame's own width. Desktop is a real desktop viewport scaled
// down to fit the pane, so the sections lay out as they will on a laptop
// rather than at whatever width is left between the two side panels.
const FRAME_WIDTH: Record<PreviewDevice, number> = { desktop: 1280, mobile: 390 };
const AUTOSAVE_MS = 800;

type Page = { id: string; slug: string };

/** Throws on an action's `{ error }` so useMutation's onError (and its
 * rollback) runs for it. */
async function unwrap<T>(result: Promise<T>): Promise<Exclude<T, { error: string }>> {
  const value = await result;
  if (value && typeof value === "object" && "error" in value) throw new Error(String(value.error));
  return value as Exclude<T, { error: string }>;
}

function Toggle<T extends string>({
  label,
  value,
  onChange,
  options,
  activeClassName = "bg-primary font-medium text-primary-foreground",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string; icon?: LucideIcon }[];
  activeClassName?: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-[10px] bg-muted p-[3px]">
      {options.map(({ value: option, label: text, icon: Icon }) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          aria-label={Icon ? text : undefined}
          onClick={() => onChange(option)}
          className={cn(
            "flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            value === option && activeClassName
          )}
        >
          {Icon ? <Icon className="size-4" aria-hidden="true" /> : text}
        </button>
      ))}
    </div>
  );
}

export function SiteEditor({
  pages,
  page,
  initialSections,
  initialVersions,
}: {
  pages: Page[];
  page: Page;
  initialSections: Section[];
  initialVersions: PageVersion[];
}) {
  const t = useTranslations("admin.site");
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const queryClient = useQueryClient();

  const selectedId = useEditorStore((s) => s.selectedId);
  const select = useEditorStore((s) => s.select);
  const previewLocale = useEditorStore((s) => s.previewLocale);
  const setPreviewLocale = useEditorStore((s) => s.setPreviewLocale);
  const device = useEditorStore((s) => s.device);
  const setDevice = useEditorStore((s) => s.setDevice);

  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [publishing, startPublish] = useTransition();
  // Bumped whenever the server's copy replaces the draft (a refused save, a
  // restored version), so the inspector drops its local copy and starts over.
  const [revision, setRevision] = useState(0);

  const draftKey = ["admin", "site", page.id] as const;
  const { data: sections } = useQuery({
    queryKey: draftKey,
    queryFn: async () => (await unwrap(getDraftAction(page.id))).sections,
    initialData: initialSections,
    staleTime: Infinity,
  });
  const selected = sections.find((s) => s.id === selectedId) ?? null;

  const errorText = useCallback(
    (code: string) => t(`errors.${t.has(`errors.${code}`) ? code : "generic"}`),
    [t]
  );

  // Open on the first section, like the design. Once per page: closing the
  // inspector afterwards must stay closed.
  useEffect(() => {
    select(initialSections[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  // ── Autosave ────────────────────────────────────────────────────────────
  // Edits land in the query cache at once (the preview and the inspector read
  // it), and the changed fields of each section are sent after a pause.
  // ponytail: an edit made in the last 0.8s before leaving the page is not
  // flushed; add a flush on pagehide if that ever bites. Publishing flushes.
  const pending = useRef(new Map<string, { type: SectionType; patch: SectionPatch }>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = [...pending.current];
    pending.current.clear();
    if (batch.length === 0) return true;

    setSaveState("saving");
    const results = await Promise.all(batch.map(([id, { type, patch }]) => saveSectionAction(id, type, patch)));
    const failed = results.find((r) => r?.error);
    if (failed?.error) {
      setSaveState("error");
      toast.error(errorText(failed.error));
      // The cache now holds edits the server refused; go back to what it has.
      await queryClient.invalidateQueries({ queryKey: draftKey });
      setRevision((n) => n + 1);
      return false;
    }
    setSaveState("saved");
    setSavedAt(new Date());
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id, errorText, queryClient]);

  function updateSection(section: Section, patch: SectionPatch) {
    queryClient.setQueryData<Section[]>(draftKey, (old) =>
      old?.map((s) => (s.id === section.id ? ({ ...s, ...patch } as Section) : s))
    );
    const queued = pending.current.get(section.id);
    pending.current.set(section.id, { type: section.type, patch: { ...queued?.patch, ...patch } });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  // ── Structure changes: optimistic, rolled back if the server says no ────
  const rollback = (error: Error, _vars: unknown, context: { previous?: Section[] } | undefined) => {
    if (context?.previous) queryClient.setQueryData(draftKey, context.previous);
    toast.error(errorText(error.message));
  };

  const reorder = useMutation({
    mutationFn: (ids: string[]) => unwrap(reorderSectionsAction(page.id, ids)),
    onMutate: (ids) => {
      const previous = queryClient.getQueryData<Section[]>(draftKey);
      queryClient.setQueryData<Section[]>(draftKey, (old) =>
        ids.flatMap((id, i) => {
          const section = old?.find((s) => s.id === id);
          return section ? [{ ...section, position: i + 1 }] : [];
        })
      );
      return { previous };
    },
    onError: rollback,
  });

  const remove = useMutation({
    mutationFn: (id: string) => unwrap(deleteSectionAction(id)),
    onMutate: (id) => {
      const previous = queryClient.getQueryData<Section[]>(draftKey);
      pending.current.delete(id);
      queryClient.setQueryData<Section[]>(draftKey, (old) => old?.filter((s) => s.id !== id));
      select(null);
      return { previous };
    },
    onError: rollback,
  });

  // Not optimistic: the new section's id comes from the server.
  const add = useMutation({
    mutationFn: (type: SectionType) =>
      unwrap(addSectionAction(page.id, type, Math.max(0, ...sections.map((s) => s.position)) + 1)),
    onSuccess: ({ section }) => {
      queryClient.setQueryData<Section[]>(draftKey, (old) => [...(old ?? []), section]);
      select(section.id);
    },
    onError: (error: Error) => toast.error(errorText(error.message)),
  });

  // ── Preview frame ───────────────────────────────────────────────────────
  const frameRef = useRef<HTMLIFrameElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ width: 0, height: 0 });

  const postState = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage(
      { type: "cms:state", sections, selectedId } satisfies PreviewMessage,
      window.location.origin
    );
  }, [sections, selectedId]);

  useEffect(postState, [postState]);

  useEffect(() => {
    function onMessage(event: MessageEvent<PreviewMessage>) {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      // The frame reloads when the preview language changes and asks again.
      if (event.data?.type === "cms:ready") postState();
      if (event.data?.type === "cms:select") select(event.data.id);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [postState, select]);

  useEffect(() => {
    const element = paneRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setPane({ width: entry.contentRect.width, height: entry.contentRect.height })
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const frameWidth = FRAME_WIDTH[device];
  const scale = pane.width > 0 ? Math.min(1, pane.width / frameWidth) : 1;

  // ── Publish ─────────────────────────────────────────────────────────────
  function describeIssue(issue: PublishIssue) {
    if (issue.code === "no_visible_sections") return t("issues.no_visible_sections");
    const section = sections.find((s) => s.id === issue.sectionId);
    const name = section ? t(`types.${section.type}`) : "";
    if (issue.code === "invalid_content") return t("issues.invalid_content", { section: name });
    return t("issues.missing_translation", { section: name, language: t(`languages.${issue.locale}`) });
  }

  function publish() {
    startPublish(async () => {
      // What gets published is the draft on the server, so anything still
      // waiting to be saved goes first.
      if (!(await flush())) return;
      const result = await publishAction(page.id);
      setConfirmPublish(false);
      if (result?.error) {
        const issue = result.issues?.[0];
        if (!issue) {
          toast.error(errorText(result.error));
          return;
        }
        toast.error(describeIssue(issue));
        if ("sectionId" in issue) {
          select(issue.sectionId);
          if (issue.code === "missing_translation") setPreviewLocale(issue.locale);
        }
        return;
      }
      await queryClient.invalidateQueries({ queryKey: versionsKey(page.id) });
      toast.success(t("published"));
    });
  }

  const Back = locale === "ar" ? ArrowRight : ArrowLeft;
  const pageLabel = (slug: string) => (t.has(`pages.${slug}`) ? t(`pages.${slug}`) : slug);

  return (
    <div className="flex h-dvh flex-col text-sm">
      {/* `dark` so the bar is navy in both themes and every control on it
          resolves against dark tokens. */}
      <header className="dark flex flex-wrap items-center gap-3 bg-card px-4 py-2.5 text-foreground">
        <Link
          href="/admin"
          aria-label={t("back")}
          className={cn(buttonVariants({ variant: "ghost", size: "icon" }))}
        >
          <Back className="size-4" aria-hidden="true" />
        </Link>
        <h1 className="pe-2 text-base font-bold">{t("title")}</h1>

        <Select
          value={page.slug}
          onValueChange={(slug) => slug && slug !== page.slug && router.push(`/admin/site?page=${slug}`)}
        >
          <SelectTrigger aria-label={t("page")} className="min-h-11">
            <SelectValue>{(slug: string) => pageLabel(slug)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {pages.map((p) => (
              <SelectItem key={p.id} value={p.slug}>
                {pageLabel(p.slug)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Toggle
          label={t("language")}
          value={previewLocale}
          onChange={setPreviewLocale}
          options={[
            { value: "ar", label: t("languages.ar") },
            { value: "en", label: t("languages.en") },
          ]}
        />
        <Toggle
          label={t("device")}
          value={device}
          onChange={setDevice}
          activeClassName="bg-foreground/15"
          options={[
            { value: "desktop", label: t("devices.desktop"), icon: Monitor },
            { value: "mobile", label: t("devices.mobile"), icon: Smartphone },
          ]}
        />

        <span className="flex-1" />

        <span role="status" className="text-muted-foreground">
          {saveState === "saving" && t("status.saving")}
          {saveState === "error" && t("status.error")}
          {saveState === "saved" && savedAt && (
            <>
              {t("status.saved")}{" "}
              <span className="font-mono">
                {savedAt.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              </span>
            </>
          )}
        </span>
        <Button type="button" variant="secondary" onClick={() => setHistoryOpen(true)}>
          {t("history.title")}
        </Button>
        <Button type="button" disabled={publishing} onClick={() => setConfirmPublish(true)}>
          {t("publish")}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <SectionList
          sections={sections}
          selectedId={selectedId}
          adding={add.isPending}
          onSelect={select}
          onReorder={(ids) => reorder.mutate(ids)}
          onAdd={(type) => add.mutate(type)}
        />

        <main className="flex min-h-[70dvh] min-w-0 flex-1 justify-center bg-muted p-4 lg:min-h-0 lg:p-6">
          <div ref={paneRef} className="relative h-full w-full max-w-[860px]">
            {/* dir=ltr on the box only: the scaled frame is positioned from
                its top-left corner, whatever the editor's direction. */}
            <div
              dir="ltr"
              className="absolute inset-y-0 overflow-hidden rounded-[14px] bg-background ring-1 ring-foreground/10"
              style={{
                width: frameWidth * scale,
                insetInlineStart: Math.max(0, (pane.width - frameWidth * scale) / 2),
              }}
            >
              <iframe
                ref={frameRef}
                key={previewLocale}
                title={t("preview.title")}
                src={`/${previewLocale}/admin/site/preview`}
                className="block border-0"
                style={{
                  width: frameWidth,
                  height: pane.height / scale,
                  transform: `scale(${scale})`,
                  transformOrigin: "top left",
                }}
              />
            </div>
          </div>
        </main>

        {selected ? (
          <Inspector
            key={`${selected.id}:${revision}`}
            section={selected}
            locale={previewLocale}
            imageFolder={page.slug}
            onChange={(patch) => updateSection(selected, patch)}
            onDelete={() => remove.mutate(selected.id)}
            onClose={() => select(null)}
          />
        ) : (
          <aside className="shrink-0 border-border bg-card p-5 lg:w-[340px] lg:border-s">
            <p className="rounded-[10px] bg-muted/60 p-3 text-muted-foreground">{t("inspector.hint")}</p>
          </aside>
        )}
      </div>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={t("publishTitle")}
        description={t("publishDescription")}
        confirmLabel={t("publish")}
        variant="default"
        pending={publishing}
        onConfirm={publish}
      />

      <VersionSheet
        pageId={page.id}
        initialVersions={initialVersions}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestored={() => {
          pending.current.clear();
          void queryClient.invalidateQueries({ queryKey: draftKey }).then(() => setRevision((n) => n + 1));
        }}
      />
    </div>
  );
}
