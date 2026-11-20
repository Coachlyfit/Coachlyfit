"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { AbstractIntlMessages } from "next-intl";
import { ArrowLeft, ArrowUpRight, Check, Circle } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { publicStorageUrl, type SiteView } from "@/domain/sites/public-site";
import type { ResultCard } from "@/domain/sites/results.service";
import type { ReviewItem } from "@/domain/sites/reviews.service";
import {
  checklist,
  countChanges,
  defaultDraft,
  flatten,
  hasText,
  publishIssues,
  type Lang,
  SECTION_KEYS,
  type SectionKey,
  type SiteDraft,
  type SiteSection,
} from "@/domain/sites/site-content";
import { isStyled, type SectionStyle } from "@/domain/sites/section-style";
import type { SiteColors } from "@/domain/sites/theme";
import { cn } from "@/lib/utils";
import { publishAction, saveDraftAction } from "@/app/[locale]/(coach)/website/actions";
import { AutosaveIndicator } from "./autosave-indicator";
import type { ClientOption } from "./create-card-dialog";
import { ColorsPanel } from "./colors-panel";
import { PublishPanel } from "./publish-panel";
import { ResultsManager } from "./results-manager";
import { ReviewsManager } from "./reviews-manager";
import { SectionFormAbout } from "./section-form-about";
import { SectionFormCta } from "./section-form-cta";
import { SectionFormFaq } from "./section-form-faq";
import { SectionFormFooter } from "./section-form-footer";
import { SectionFormHero } from "./section-form-hero";
import { SectionFormHow } from "./section-form-how";
import { SectionFormServices } from "./section-form-services";
import { SectionList } from "./section-list";
import { SectionStyleForm } from "./section-style-form";
import { SitePreview, type PreviewDevice, type PreviewLang } from "./site-preview";
import { useAutosave } from "./use-autosave";

export type EditorInitial = {
  draft: SiteDraft;
  published: SiteDraft | null;
  publishedAt: string | null;
  isLive: boolean;
  domain: string | null;
};

export type EditorCoach = {
  id: string;
  name: string;
  logoUrl: string | null;
  colors: SiteColors;
  /** Public address of the site, for "View site". */
  siteUrl: string;
  /** Host shown next to the title, e.g. coachahmed.fit. */
  displayHost: string;
};

type Tab = "sections" | "colors" | "results" | "reviews" | "domain";
const TABS: Tab[] = ["sections", "colors", "results", "reviews", "domain"];

export function WebsiteEditorShell({
  initial,
  coach,
  cards,
  clients,
  reviews,
  locale,
  siteMessages,
}: {
  initial: EditorInitial;
  coach: EditorCoach;
  cards: ResultCard[];
  clients: ClientOption[];
  reviews: ReviewItem[];
  locale: PreviewLang;
  siteMessages: Record<PreviewLang, AbstractIntlMessages>;
}) {
  const t = useTranslations("websiteEditor");
  const [draft, setDraft] = useState(initial.draft);
  const [published, setPublished] = useState(initial.published);
  const [publishedAt, setPublishedAt] = useState(initial.publishedAt);
  const [isLive, setIsLive] = useState(initial.isLive);
  const [tab, setTab] = useState<Tab>("sections");
  const [editing, setEditing] = useState<SectionKey | null>(null);
  const [inspectorTab, setInspectorTab] = useState<"content" | "style">("content");
  const [pane, setPane] = useState<"edit" | "preview">("edit");
  const [device, setDevice] = useState<PreviewDevice>("phone");
  // Starts as the dashboard's own theme; the coach can flip it to check both.
  const { resolvedTheme } = useTheme();
  const [schemeChoice, setSchemeChoice] = useState<"light" | "dark" | null>(null);
  const scheme = schemeChoice ?? (resolvedTheme === "dark" ? "dark" : "light");
  // One language for both: the text the forms edit and the preview shows.
  const [lang, setLang] = useState<Lang>(locale);
  const [publishing, startPublish] = useTransition();
  const autosave = useAutosave(saveDraftAction);

  // Every edit lands here: applied locally first (preview and forms read local
  // state), then autosaved.
  function update(patch: Partial<SiteDraft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    autosave.schedule(next);
  }

  const pendingReviews = reviews.filter((r) => r.status === "pending").length;
  const approvedReviews = reviews.filter((r) => r.status === "approved").length;
  const publishedCards = cards.filter((c) => c.published).length;

  const issues = publishIssues(draft);
  const changes = countChanges(draft, published);
  const everPublished = published !== null;
  const status = !everPublished || !isLive ? "unpublished" : changes > 0 ? "draft" : "published";
  const setup = checklist(draft, { hasDomain: initial.domain !== null, hasReview: approvedReviews > 0 });
  const canPublish = issues.length === 0 && autosave.state === "saved" && !publishing;

  const view: SiteView = useMemo(
    () => ({
      coachName: coach.name,
      logoUrl: coach.logoUrl,
      colors: coach.colors,
      domain: initial.domain,
      content: flatten(draft, lang),
      theme: draft.theme,
      photoUrl: draft.about.photoPath
        ? publicStorageUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, "coach-site", draft.about.photoPath)
        : null,
      // What visitors will see: published, still-consented cards and approved reviews.
      results: cards
        .filter((c) => c.published)
        .map((c) => ({ id: c.id, beforeUrl: c.beforeUrl, afterUrl: c.afterUrl, durationDays: c.durationDays, weightDelta: c.weightDelta })),
      reviews: reviews.filter((r) => r.status === "approved").map((r) => ({ id: r.id, name: r.displayName, rating: r.rating, text: r.body })),
    }),
    [coach, draft, lang, initial.domain, cards, reviews]
  );

  const summaries = {
    hero: t("sections.summary.hero"),
    about: draft.about.photoPath ? t("sections.summary.about") : t("sections.summary.aboutEmpty"),
    services: t("sections.summary.services", { count: draft.services.filter((s) => hasText(s.title)).length }),
    results:
      cards.length > 0
        ? t("sections.summary.results", { published: publishedCards, total: cards.length })
        : t("sections.summary.resultsEmpty"),
    reviews: t("sections.summary.reviews", { count: approvedReviews }),
    how: t("sections.summary.how"),
    faq: t("sections.summary.faq", { count: draft.faq.filter((f) => hasText(f.q)).length }),
    cta: t("sections.summary.cta"),
    footer: t("sections.summary.footer"),
  } satisfies Record<SectionKey, string>;

  function edit(key: SectionKey) {
    setInspectorTab("content");
    setEditing(key);
  }

  // A click on a section in the preview opens it here. Keeps the Content/Style
  // tab you were on, so you can click through sections while styling.
  function selectFromPreview(key: SectionKey) {
    setTab("sections");
    setEditing(key);
    setPane("edit");
  }

  // An all-default style is the same as none: don't store it.
  function setStyle(key: SectionKey, style: SectionStyle) {
    const styles = { ...draft.styles };
    if (isStyled(style)) styles[key] = style;
    else delete styles[key];
    update({ styles });
  }

  const sectionNames = Object.fromEntries(SECTION_KEYS.map((k) => [k, t(`sections.names.${k}`)])) as Record<SectionKey, string>;

  function publish() {
    startPublish(async () => {
      const result = await publishAction();
      if (result?.error) {
        toast.error(t.has(`errors.${result.error}`) ? t(`errors.${result.error}`) : t("errors.generic"));
        return;
      }
      setPublished(draft);
      setPublishedAt(new Date().toISOString());
      // The first publish also turns the site live (the server does the same).
      if (!everPublished) setIsLive(true);
      toast.success(t("published"));
    });
  }

  function discarded() {
    setDraft(published ?? defaultDraft());
    setEditing(null);
  }

  const form = editing && (
    <div className="flex flex-col gap-4">
      <Button type="button" variant="ghost" size="sm" className="min-h-11 self-start" onClick={() => setEditing(null)}>
        <ArrowLeft className="rtl:rotate-180" aria-hidden="true" />
        {t("sections.back")}
      </Button>
      <h2 className="text-lg font-semibold">{t(`sections.names.${editing}`)}</h2>
      <Tabs value={inspectorTab} onValueChange={(v) => setInspectorTab(v as "content" | "style")}>
        <TabsList className="w-full">
          {(["content", "style"] as const).map((id) => (
            <TabsTrigger key={id} value={id} className="min-h-11 flex-1">
              {t(`style.tabs.${id}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {inspectorTab === "style" && (
        <SectionStyleForm key={editing} style={draft.styles[editing]} scheme={scheme} onChange={(style) => setStyle(editing, style)} />
      )}
      {/* key: switching language remounts the form so it edits that language's text. */}
      {inspectorTab === "content" && (
      <div key={`${editing}-${lang}`}>
        {(editing === "results" || editing === "reviews") && (
          <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm text-muted-foreground">{t("style.managedElsewhere", { name: t(`sections.names.${editing}`) })}</p>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setTab(editing)}>
              {t("style.openTab", { name: t(`tabs.${editing}`) })}
            </Button>
          </div>
        )}
        {editing === "hero" && <SectionFormHero content={draft} lang={lang} onChange={update} />}
        {editing === "about" && <SectionFormAbout content={draft} lang={lang} coachId={coach.id} onChange={update} />}
        {editing === "services" && <SectionFormServices content={draft} lang={lang} onChange={update} />}
        {editing === "how" && <SectionFormHow content={draft} lang={lang} onChange={update} />}
        {editing === "faq" && <SectionFormFaq content={draft} lang={lang} onChange={update} />}
        {editing === "cta" && <SectionFormCta content={draft} lang={lang} onChange={update} />}
        {editing === "footer" && <SectionFormFooter content={draft} onChange={update} />}
      </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <span
            className={cn(
              "rounded-md px-2.5 py-0.5 text-sm font-medium",
              status === "published" && "bg-success-tint text-success-tint-foreground",
              status === "draft" && "bg-warning-tint text-warning-tint-foreground",
              status === "unpublished" && "bg-muted text-muted-foreground"
            )}
          >
            {t(`status.${status}`)}
          </span>
          <bdi dir="ltr" className="truncate font-mono text-sm text-muted-foreground">
            {coach.displayHost}
          </bdi>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <AutosaveIndicator state={autosave.state} onRetry={autosave.retry} />
          <a
            href={coach.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11.5 items-center gap-1.5 rounded-[11px] px-4 text-sm font-medium ring-1 ring-foreground/20 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {t("viewSite")}
            <ArrowUpRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </a>
          <Button type="button" className="min-h-11.5" disabled={!canPublish || (everPublished && changes === 0)} onClick={publish}>
            {t("publishChanges")}
          </Button>
        </div>
        {issues.length > 0 && (
          <p className="basis-full text-sm text-muted-foreground" role="status">
            {issues.includes("services") ? t("publishBlocked") : t("publishNeedsWhatsapp")}
          </p>
        )}
      </header>

      <Tabs value={pane} onValueChange={(v) => setPane(v as "edit" | "preview")} className="lg:hidden">
        <TabsList className="w-full">
          <TabsTrigger value="edit" className="min-h-11 flex-1">
            {t("tabs.edit")}
          </TabsTrigger>
          <TabsTrigger value="preview" className="min-h-11 flex-1">
            {t("tabs.preview")}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid items-start gap-6 lg:grid-cols-[520px_minmax(0,1fr)]">
        <section aria-label={t("tabs.edit")} className={cn("flex min-w-0 flex-col gap-4", pane !== "edit" && "max-lg:hidden")}>
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span id="website-lang-label" className="text-sm font-medium">
                {t("language.label")}
              </span>
              <div role="group" aria-labelledby="website-lang-label" className="flex gap-1">
                {(["ar", "en"] as const).map((l) => (
                  <Button
                    key={l}
                    type="button"
                    size="sm"
                    variant={lang === l ? "secondary" : "ghost"}
                    className="min-h-11 font-mono"
                    aria-pressed={lang === l}
                    onClick={() => setLang(l)}
                  >
                    {t(l === "ar" ? "preview.arabic" : "preview.english")}
                  </Button>
                ))}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{t("language.hint")}</p>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="w-full">
              {TABS.map((id) => (
                <TabsTrigger key={id} value={id} className="min-h-11 flex-1 gap-1.5 whitespace-nowrap">
                  {t(`tabs.${id}`)}
                  {id === "reviews" && pendingReviews > 0 && (
                    <span className="rounded-full bg-primary px-1.5 font-mono text-xs text-primary-foreground" aria-label={t("reviews.filter.pending", { n: pendingReviews })}>
                      {pendingReviews}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          {tab === "sections" &&
            (form || (
              <>
                {!everPublished && (
                  <div className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    <div>
                      <h2 className="text-base font-semibold">{t("setup.title")}</h2>
                      <p className="text-sm text-muted-foreground">{t("setup.text")}</p>
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {(["photoBio", "services", "domain", "review"] as const).map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm">
                          {setup[item] ? (
                            <Check className="size-4 text-success-tint-foreground" aria-hidden="true" />
                          ) : (
                            <Circle className="size-4 text-muted-foreground" aria-hidden="true" />
                          )}
                          <span>{t(`setup.${item}`)}</span>
                          <span className="sr-only">{setup[item] ? t("setup.done") : t("setup.todo")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <SectionList
                  sections={draft.sections}
                  summaries={summaries}
                  onReorder={(sections: SiteSection[]) => update({ sections })}
                  onToggle={(key, enabled) => update({ sections: draft.sections.map((s) => (s.key === key ? { ...s, enabled } : s)) })}
                  onEdit={edit}
                />
              </>
            ))}

          {tab === "results" && <ResultsManager cards={cards} clients={clients} />}
          {tab === "reviews" && <ReviewsManager reviews={reviews} clients={clients} cards={cards} />}
          {tab === "colors" && (
            <ColorsPanel
              theme={draft.theme}
              base={{ p: coach.colors.primary, a: coach.colors.accent }}
              scheme={scheme}
              onSchemeChange={setSchemeChoice}
              onChange={(theme) => update({ theme })}
            />
          )}
          {tab === "domain" && (
            <div className="flex flex-col gap-4">
              <PublishPanel
                isLive={isLive}
                everPublished={everPublished}
                publishedAt={publishedAt}
                changes={changes}
                canPublish={issues.length === 0 && autosave.state === "saved"}
                canDiscard={autosave.state === "saved"}
                publishing={publishing}
                siteUrl={coach.siteUrl}
                onPublish={publish}
                onLiveChange={setIsLive}
                onDiscarded={discarded}
              />
            </div>
          )}
        </section>

        <section
          aria-label={t("preview.label")}
          className={cn("flex min-w-0 flex-col gap-3 lg:sticky lg:top-4", pane !== "preview" && "max-lg:hidden")}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div role="group" aria-label={t("preview.label")} className="flex gap-1">
              {(["phone", "desktop"] as const).map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={device === d ? "secondary" : "ghost"}
                  className="min-h-11"
                  aria-pressed={device === d}
                  onClick={() => setDevice(d)}
                >
                  {t(`preview.${d}`)}
                </Button>
              ))}
            </div>
            <div role="group" aria-label={t("preview.scheme")} className="flex gap-1">
              {(["light", "dark"] as const).map((sc) => (
                <Button
                  key={sc}
                  type="button"
                  size="sm"
                  variant={scheme === sc ? "secondary" : "ghost"}
                  className="min-h-11"
                  aria-pressed={scheme === sc}
                  onClick={() => setSchemeChoice(sc)}
                >
                  {t(`preview.${sc}`)}
                </Button>
              ))}
            </div>
            {/* ponytail: same `lang` state as the edit-pane toggle; only needed where the edit pane is hidden (< lg) */}
            <div role="group" aria-label={t("preview.language")} className="flex gap-1 lg:hidden">
              {(["ar", "en"] as const).map((l) => (
                <Button
                  key={l}
                  type="button"
                  size="sm"
                  variant={lang === l ? "secondary" : "ghost"}
                  className="min-h-11 font-mono"
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                >
                  {t(l === "ar" ? "preview.arabic" : "preview.english")}
                </Button>
              ))}
            </div>
          </div>
          {coach.colors.adjusted && <p className="text-sm text-muted-foreground">{t("colorsAdjusted")}</p>}
          <SitePreview
            view={view}
            device={device}
            lang={lang}
            scheme={scheme}
            siteMessages={siteMessages}
            selected={tab === "sections" ? editing : null}
            onSelect={selectFromPreview}
            sectionNames={sectionNames}
          />
        </section>
      </div>
    </div>
  );
}
