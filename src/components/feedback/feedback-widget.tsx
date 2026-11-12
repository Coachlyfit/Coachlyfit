"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bug, Lightbulb, MessageSquarePlus, Star, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScreenshotPicker, type PickedScreenshot } from "@/components/feedback/screenshot-picker";
import { cn } from "@/lib/utils";
import { FEEDBACK_BODY_MAX, FEEDBACK_KINDS, RATING_MAX, feedbackFolder, type FeedbackKind } from "@/domain/feedback/feedback";
import { submitFeedbackAction } from "@/app/[locale]/feedback-actions";

const KIND_ICON: Record<FeedbackKind, LucideIcon> = { bug: Bug, feature: Lightbulb, rating: Star };

// Always-present, secondary affordance for coaches and clients alike (the role
// is resolved server-side) -- floating above the mobile bottom nav and closer
// to the corner on desktop. Toast-only success, same reasoning as
// BroadcastDialog: there's no visible list for the sender to see their own
// submission land in (feedback is write-only for them, see the migration).
// userId is only the first folder of the screenshot's storage path.
export function FeedbackWidget({ userId }: { userId: string }) {
  const t = useTranslations("feedback");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label={t("trigger")}
            className="fixed bottom-[calc(var(--bottom-nav-h)+0.5rem)] end-4 z-40 rounded-full shadow-lg lg:bottom-4"
          />
        }
      >
        <MessageSquarePlus className="size-5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts clean with a fresh id. */}
        {open && <FeedbackForm userId={userId} onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({ userId, onClose }: { userId: string; onClose: () => void }) {
  const t = useTranslations("feedback");
  const tErrors = useTranslations("feedback.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  // Fixed for the life of the form: the screenshot is uploaded under it
  // before the feedback row exists.
  const [id] = useState(() => crypto.randomUUID());
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [screenshot, setScreenshot] = useState<PickedScreenshot | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRating = kind === "rating";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!kind) return setError("kind_required");
    if (isRating && rating === 0) return setError("rating_required");
    if (!isRating && body.trim() === "") return setError("body_required");
    setError(null);

    startTransition(async () => {
      const result = await submitFeedbackAction({
        id,
        kind,
        ...(isRating ? { rating } : {}),
        body: body.trim() || undefined,
        screenshotPath: screenshot?.path ?? null,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      onClose();
      toast.success(t("success"));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <div role="group" aria-label={t("kindLabel")} className="flex flex-wrap gap-2">
        {FEEDBACK_KINDS.map((value) => {
          const Icon = KIND_ICON[value];
          const selected = kind === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              disabled={pending}
              onClick={() => setKind(value)}
              className={cn(
                "flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                selected
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-muted/50 text-foreground hover:bg-muted"
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {t(`kinds.${value}`)}
            </button>
          );
        })}
      </div>

      {isRating && (
        <div className="flex flex-col gap-1.5">
          <Label id="feedback-rating-label">{t("ratingLabel")}</Label>
          <div role="radiogroup" aria-labelledby="feedback-rating-label" className="flex gap-1">
            {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={t("stars", { count: value })}
                disabled={pending}
                onClick={() => setRating(value)}
                className="flex size-10 items-center justify-center rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Star
                  className={cn("size-7", value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="feedback-body">
          {t("description")}
          {isRating ? (
            <span className="font-normal text-muted-foreground">{t("optional")}</span>
          ) : (
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        <Textarea
          id="feedback-body"
          rows={4}
          maxLength={FEEDBACK_BODY_MAX}
          placeholder={t(`placeholders.${kind ?? "bug"}`)}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={pending}
          dir="auto"
          aria-required={!isRating}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("screenshot.label")}</Label>
        <ScreenshotPicker
          folder={feedbackFolder(userId, id)}
          value={screenshot}
          onChange={setScreenshot}
          onUploadingChange={setUploading}
          disabled={pending}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {tErrors.has(error) ? tErrors(error) : tErrors("send_failed")}
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
          {tCommon("cancel")}
        </Button>
        <Button type="submit" disabled={pending || uploading} className="min-w-24">
          {pending ? tCommon("pending") : t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}
