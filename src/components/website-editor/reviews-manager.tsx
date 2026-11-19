"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ResultCard } from "@/domain/sites/results.service";
import type { ReviewItem, ReviewStatus } from "@/domain/sites/reviews.service";
import { StarIcon } from "@/components/site/icons";
import { setReviewStatusAction } from "@/app/[locale]/(coach)/website/actions";
import type { ClientOption } from "./create-card-dialog";
import { ReviewRequestCard } from "./review-request-card";

const FILTERS: ReviewStatus[] = ["pending", "approved", "hidden"];

function ReviewCard({ review }: { review: ReviewItem }) {
  const t = useTranslations("websiteEditor.reviews");
  const tErr = useTranslations("websiteEditor.errors");
  const [pending, startTransition] = useTransition();

  function setStatus(status: ReviewStatus) {
    startTransition(async () => {
      const res = await setReviewStatusAction(review.id, status);
      if (res?.error) toast.error(tErr.has(res.error as "generic") ? tErr(res.error as "generic") : tErr("generic"));
    });
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          {/* Full name: the coach's private dashboard. */}
          <p className="truncate font-semibold">{review.clientName}</p>
          <p className="text-sm text-muted-foreground">{t("shownAs", { name: review.displayName })}</p>
        </div>
        <div className="flex gap-0.5 text-primary" role="img" aria-label={t("rating", { n: review.rating })}>
          {[1, 2, 3, 4, 5].map((k) => (
            <StarIcon key={k} filled={k <= review.rating} />
          ))}
        </div>
      </div>

      {/* Not a form control: there is nothing here to edit, by design. */}
      <blockquote className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          {t("readOnly")}
        </span>
        <p className="text-base leading-relaxed [overflow-wrap:anywhere]">{review.body}</p>
      </blockquote>

      {review.sharePhotos && <p className="text-sm text-muted-foreground">{t("sharesPhotos")}</p>}

      <div className="flex flex-wrap gap-2">
        {review.status === "pending" && (
          <>
            <Button type="button" className="min-h-11" disabled={pending} onClick={() => setStatus("approved")}>
              {t("approve")}
            </Button>
            <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => setStatus("hidden")}>
              {t("hide")}
            </Button>
          </>
        )}
        {review.status === "approved" && (
          <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={() => setStatus("hidden")}>
            {t("hide")}
          </Button>
        )}
        {review.status === "hidden" && (
          <Button type="button" className="min-h-11" disabled={pending} onClick={() => setStatus("approved")}>
            {t("show")}
          </Button>
        )}
      </div>
    </li>
  );
}

export function ReviewsManager({ reviews, clients, cards }: { reviews: ReviewItem[]; clients: ClientOption[]; cards: ResultCard[] }) {
  const t = useTranslations("websiteEditor.reviews");
  const [filter, setFilter] = useState<ReviewStatus>("pending");
  const counts = { pending: 0, approved: 0, hidden: 0 } satisfies Record<ReviewStatus, number>;
  for (const r of reviews) counts[r.status]++;
  const shown = reviews.filter((r) => r.status === filter);

  return (
    <div className="flex flex-col gap-4">
      <ReviewRequestCard clients={clients} cards={cards} />

      <div className="flex items-start gap-3 rounded-xl bg-muted/60 p-3">
        <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold">{t("lock.title")}</p>
          <p className="text-sm text-muted-foreground">{t("lock.text")}</p>
        </div>
      </div>

      {reviews.length === 0 ? (
        <div className="flex flex-col items-center gap-1 rounded-xl p-6 text-center ring-1 ring-foreground/10">
          <h2 className="font-semibold">{t("empty.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("empty.text")}</p>
        </div>
      ) : (
        <>
          <div role="group" aria-label={t("filter.label")} className="flex flex-wrap gap-1">
            {FILTERS.map((f) => (
              <Button
                key={f}
                type="button"
                size="sm"
                variant={filter === f ? "secondary" : "ghost"}
                className="min-h-11"
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {t(`filter.${f}`, { n: counts[f] })}
              </Button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t("none")}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {shown.map((r) => (
                <ReviewCard key={r.id} review={r} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
