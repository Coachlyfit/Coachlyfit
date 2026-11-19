"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { ConsentRequiredError, ResultsService, type ClientPhoto } from "@/domain/sites/results.service";
import { ReviewsService } from "@/domain/sites/reviews.service";
import { siteDraftSchema, type SiteDraft } from "@/domain/sites/site-content";
import { DomainTakenError, NotPublishedError, PublishBlockedError, SitesService } from "@/domain/sites/sites.service";
import { normalizeDomain, VercelDomains, type DomainStatus } from "@/domain/sites/vercel-domains";
import { resolveCoachId } from "@/lib/auth/resolve-coach-id";
import { siteUrl } from "@/lib/sites/origin";
import { siteTag } from "@/lib/sites/public-site";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error: string } | void;

async function context() {
  const supabase = await createClient();
  const coachId = await resolveCoachId(supabase);
  if (!coachId) return null;
  return { supabase, coachId, sites: new SitesService(supabase) };
}

/** Visitors see the published copy, so only changes to it need revalidating. */
async function bust(sites: SitesService, coachId: string, extraKeys: string[] = []) {
  const keys = new Set([...(await sites.siteKeys(coachId)), ...extraKeys]);
  for (const key of keys) revalidateTag(siteTag(key), "max");
}

const refresh = () => revalidatePath("/[locale]/website", "page");

// ------------------------------------------------------------------ draft

/** Autosave. Saves the draft only: nothing public changes. */
export async function saveDraftAction(input: SiteDraft): Promise<ActionResult> {
  const parsed = siteDraftSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    await ctx.sites.saveDraft(ctx.coachId, parsed.data);
  } catch {
    return { error: "save_failed" };
  }
}

export async function publishAction(): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    await ctx.sites.publish(ctx.coachId);
  } catch (e) {
    return { error: e instanceof PublishBlockedError ? "publish_blocked" : "publish_failed" };
  }
  await bust(ctx.sites, ctx.coachId);
}

export async function discardDraftAction(): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    await ctx.sites.discardDraft(ctx.coachId);
  } catch {
    return { error: "discard_failed" };
  }
  refresh();
}

export async function setLiveAction(live: boolean): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    await ctx.sites.setLive(ctx.coachId, live);
  } catch (e) {
    return { error: e instanceof NotPublishedError ? "not_published" : "live_failed" };
  }
  await bust(ctx.sites, ctx.coachId);
}

// ---------------------------------------------------------------- results

const uuid = z.string().uuid();
const createCardSchema = z
  .object({
    clientId: uuid,
    beforeMediaId: uuid,
    afterMediaId: uuid,
    durationDays: z.number().int().min(1).max(3650),
    weightDelta: z.number().min(-200).max(200).nullable(),
  })
  .refine((v) => v.beforeMediaId !== v.afterMediaId);

export async function loadClientPhotosAction(clientId: string): Promise<{ error: string } | { photos: ClientPhoto[] }> {
  if (!uuid.safeParse(clientId).success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    return { photos: await new ResultsService(ctx.supabase).clientPhotos(ctx.coachId, clientId) };
  } catch {
    return { error: "load_failed" };
  }
}

export async function createCardAction(input: z.infer<typeof createCardSchema>): Promise<ActionResult> {
  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    await new ResultsService(ctx.supabase).createCard(ctx.coachId, parsed.data);
  } catch {
    return { error: "card_failed" };
  }
  refresh();
}

export async function requestConsentAction(cardId: string): Promise<ActionResult> {
  if (!uuid.safeParse(cardId).success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    await new ResultsService(ctx.supabase).requestConsent(cardId);
  } catch {
    return { error: "consent_failed" };
  }
  refresh();
}

export async function setCardPublishedAction(cardId: string, publish: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(cardId).success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    const site = await ctx.sites.getOrCreate(ctx.coachId);
    await new ResultsService(ctx.supabase).setPublished(ctx.coachId, site.id, cardId, publish);
  } catch (e) {
    return { error: e instanceof ConsentRequiredError ? "consent_required" : "result_failed" };
  }
  await bust(ctx.sites, ctx.coachId);
  refresh();
}

// ---------------------------------------------------------------- reviews

const requestSchema = z.object({ clientId: uuid, cardId: uuid.nullable() });

/** A personal, single-use review link. The plaintext token exists only in this
 * response: the database keeps its hash. */
export async function createReviewRequestAction(
  input: z.infer<typeof requestSchema>
): Promise<{ error: string } | { url: string; expiresAt: string }> {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    const [{ token, expiresAt }, site, coach] = await Promise.all([
      new ReviewsService(ctx.supabase).createRequest(ctx.coachId, parsed.data),
      ctx.sites.getOrCreate(ctx.coachId),
      ctx.supabase.from("coaches").select("slug").eq("id", ctx.coachId).single(),
    ]);
    if (coach.error) throw coach.error;
    // A custom domain only once it's actually connected; until then the
    // white-label / app URL serves the same page.
    const url = siteUrl(
      { domain: site.domainStatus === "connected" ? site.domain : null, coach: { slug: coach.data.slug } },
      { path: `/review/${token}` }
    );
    return { url, expiresAt: expiresAt.toISOString() };
  } catch {
    return { error: "request_failed" };
  }
}

const statusSchema = z.enum(["pending", "approved", "hidden"]);

export async function setReviewStatusAction(reviewId: string, status: z.infer<typeof statusSchema>): Promise<ActionResult> {
  if (!uuid.safeParse(reviewId).success || !statusSchema.safeParse(status).success) return { error: "invalid_input" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  try {
    await new ReviewsService(ctx.supabase).setStatus(ctx.coachId, reviewId, status);
  } catch {
    return { error: "review_failed" };
  }
  await bust(ctx.sites, ctx.coachId);
  refresh();
}

// ----------------------------------------------------------------- domain

export type DomainResult = { error: string } | { domain: string | null; state: "none" | DomainStatus["state"]; records: DomainStatus["records"] };

/** Connect (or change) the coach's custom domain: store it, attach it to the
 * Vercel project, and report what DNS still needs. */
export async function setDomainAction(input: string): Promise<DomainResult> {
  const domain = normalizeDomain(input);
  if (!domain) return { error: "domain_invalid" };
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };

  const vercel = new VercelDomains();
  if (!vercel.isConfigured()) return { error: "domain_not_configured" };

  let previous: string | null;
  try {
    previous = await ctx.sites.setDomain(ctx.coachId, domain);
  } catch (e) {
    return { error: e instanceof DomainTakenError ? "domain_taken" : "domain_failed" };
  }
  if (previous && previous !== domain) await vercel.remove(previous);

  const attached = await vercel.add(domain);
  const status = attached ? await vercel.status(domain) : { state: "error" as const, records: [] };
  await ctx.sites.setDomainStatus(ctx.coachId, status.state);

  await bust(ctx.sites, ctx.coachId, previous ? [previous] : []);
  refresh();
  return { domain, state: status.state, records: status.records };
}

/** Re-check DNS / verification for the stored domain. */
export async function checkDomainAction(): Promise<DomainResult> {
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  const site = await ctx.sites.getOrCreate(ctx.coachId);
  if (!site.domain) return { domain: null, state: "none", records: [] };

  const vercel = new VercelDomains();
  if (!vercel.isConfigured()) return { error: "domain_not_configured" };
  await vercel.verify(site.domain);
  const status = await vercel.status(site.domain);
  await ctx.sites.setDomainStatus(ctx.coachId, status.state);
  refresh();
  return { domain: site.domain, state: status.state, records: status.records };
}

export async function removeDomainAction(): Promise<ActionResult> {
  const ctx = await context();
  if (!ctx) return { error: "not_authenticated" };
  let previous: string | null;
  try {
    previous = await ctx.sites.setDomain(ctx.coachId, null);
  } catch {
    return { error: "domain_failed" };
  }
  if (previous) {
    const vercel = new VercelDomains();
    if (vercel.isConfigured()) await vercel.remove(previous);
  }
  await bust(ctx.sites, ctx.coachId, previous ? [previous] : []);
  refresh();
}
