"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Camera, CircleOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { createClient } from "@/lib/supabase/client";
import { PROGRESS_BUCKET } from "@/domain/progress/progress.service";
import { reportOffPlanAction } from "./actions";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

/** Report a day as off-plan: optional meal, estimated kcal, note and photo.
 * The photo goes to the private progress-media bucket under the client's
 * own coach/client folder (same convention as progress photos), then the
 * action stores its path. */
export function OffPlanSheet({
  locale,
  coachId,
  clientId,
  date,
  dateLabel,
  mealLabels,
}: {
  locale: string;
  coachId: string;
  clientId: string;
  date: string;
  dateLabel: string;
  mealLabels: string[];
}) {
  const t = useTranslations("nutrition.offPlan");
  const tErrors = useTranslations("nutrition.errors");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [meal, setMeal] = useState("");
  const [kcal, setKcal] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const rawExt = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!file.type.startsWith("image/") && !ALLOWED_EXT.has(rawExt)) {
      return toast.error(tErrors("invalid_photo"));
    }
    if (file.size > MAX_BYTES) return toast.error(tErrors("photo_too_large"));
    setPhoto(file);
  }

  function reset() {
    setMeal("");
    setKcal("");
    setNote("");
    setPhoto(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      let photoPath: string | null = null;
      if (photo) {
        const rawExt = photo.name.split(".").pop()?.toLowerCase() ?? "";
        const ext = ALLOWED_EXT.has(rawExt) ? rawExt : "jpg";
        photoPath = `${coachId}/${clientId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await createClient().storage.from(PROGRESS_BUCKET).upload(photoPath, photo);
        if (error) {
          toast.error(tErrors("upload_failed"));
          return;
        }
      }

      const result = await reportOffPlanAction(locale, { log_date: date, meal, kcal, note, photo_path: photoPath });
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      toast.success(t("submitted"));
      reset();
      setOpen(false);
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <CircleOff className="size-4" />
        {t("report")}
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>{t("description", { date: dateLabel })}</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="flex flex-col gap-4 px-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="off-plan-meal">{t("meal")}</Label>
            <Input
              id="off-plan-meal"
              list="off-plan-meals"
              maxLength={100}
              placeholder={t("mealPlaceholder")}
              value={meal}
              onChange={(e) => setMeal(e.target.value)}
            />
            <datalist id="off-plan-meals">
              {mealLabels.map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="off-plan-kcal">{t("kcal")}</Label>
            <Input
              id="off-plan-kcal"
              type="number"
              inputMode="numeric"
              min={1}
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="off-plan-note">{t("note")}</Label>
            <Textarea
              id="off-plan-note"
              rows={3}
              maxLength={500}
              placeholder={t("notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {photo ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
              <span className="truncate">{photo.name}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={t("removePhoto")} onClick={() => setPhoto(null)}>
                <X className="size-4" />
              </Button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed py-3 text-sm text-muted-foreground hover:bg-muted">
              <Camera className="size-4" />
              {t("addPhoto")}
              <input type="file" accept="image/*" className="hidden" onChange={onPhoto} />
            </label>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
