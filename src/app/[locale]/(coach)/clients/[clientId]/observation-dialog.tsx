"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { ImagePlus, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChipGroup } from "@/components/chip-group";
import { createClient } from "@/lib/supabase/client";
import { compressImage, imageFileError } from "@/lib/compress-image";
import type { AppLocale } from "@/domain/locale";
import {
  OBSERVATION_CATEGORIES,
  OBSERVATION_IMAGES_BUCKET,
  OBSERVATION_SEVERITIES,
} from "@/domain/clients/observations";
import { observationSchema, type ObservationInput } from "../schemas";
import { createObservationAction, updateObservationAction } from "../actions";
import { ObservationLinkPicker, type LinkedValue } from "./observation-link-picker";

export type EditableObservation = ObservationInput & {
  id: string;
  /** Resolved label of the linked record (null when unavailable). */
  linkLabel: string | null;
  /** Signed URL of the current image. */
  imageUrl: string | null;
};

const EXT_BY_MIME: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

type ImageState = { path: string; preview: string | null } | null;

/** One form for both "add" and "edit" (pass `observation`). */
export function ObservationDialog({
  locale,
  clientId,
  coachId,
  observation,
}: {
  locale: AppLocale;
  clientId: string;
  coachId: string;
  observation?: EditableObservation;
}) {
  const t = useTranslations("clients.observations");
  const tErrors = useTranslations("clients.errors");
  const tCommon = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const initialLinked = (): LinkedValue | null =>
    observation?.linked ? { ...observation.linked, label: observation.linkLabel ?? t("link.unavailable") } : null;
  const initialImage = (): ImageState =>
    observation?.image_path ? { path: observation.image_path, preview: observation.imageUrl } : null;

  const [linked, setLinked] = useState<LinkedValue | null>(initialLinked);
  const [image, setImage] = useState<ImageState>(initialImage);

  const defaults: ObservationInput = observation ?? {
    title: "",
    category: "general",
    severity: null,
    details: "",
    linked: null,
    image_path: null,
  };
  const { register, handleSubmit, reset, control, setValue } = useForm<ObservationInput>({
    resolver: zodResolver(observationSchema),
    defaultValues: defaults,
  });
  const [title, category, severity] = useWatch({ control, name: ["title", "category", "severity"] });

  function handleOpenChange(next: boolean) {
    if (next) {
      reset(defaults);
      setLinked(initialLinked());
      setImage(initialImage());
      setFormError(null);
    }
    setOpen(next);
  }

  async function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const invalid = imageFileError(file);
    if (invalid) {
      setFormError(invalid);
      return;
    }
    setFormError(null);
    setUploading(true);
    const blob = await compressImage(file);
    const path = `${coachId}/${clientId}/${crypto.randomUUID()}.${EXT_BY_MIME[blob.type] ?? "webp"}`;
    const { error } = await createClient()
      .storage.from(OBSERVATION_IMAGES_BUCKET)
      .upload(path, blob, { contentType: blob.type, upsert: false });
    setUploading(false);
    if (error) {
      setFormError("upload_failed");
      return;
    }
    setImage({ path, preview: URL.createObjectURL(blob) });
  }

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    const input: ObservationInput = {
      ...data,
      linked: linked ? { type: linked.type, id: linked.id } : null,
      image_path: image?.path ?? null,
    };
    startTransition(async () => {
      const result = observation
        ? await updateObservationAction(locale, clientId, observation.id, input)
        : await createObservationAction(locale, clientId, input);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setOpen(false);
    });
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {observation ? (
        <DialogTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("edit")} />}>
          <Pencil className="size-4" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
          <Plus className="size-4" />
          {t("add")}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{observation ? t("edit") : t("add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="observation-title">
              {t("titleLabel")}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="observation-title"
              {...register("title")}
              placeholder={t("titlePlaceholder")}
              maxLength={120}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("categoryLabel")}</Label>
            <ChipGroup
              label={t("categoryLabel")}
              value={category}
              onChange={(v) => v && setValue("category", v)}
              options={OBSERVATION_CATEGORIES.map((v) => ({ value: v, label: t(`category.${v}`) }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("severityLabel")}</Label>
            <ChipGroup
              label={t("severityLabel")}
              value={severity}
              onChange={(v) => setValue("severity", v)}
              allowDeselect
              options={OBSERVATION_SEVERITIES.map((v) => ({ value: v, label: t(`severity.${v}`) }))}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="observation-details">{t("detailsLabel")}</Label>
            <Textarea
              id="observation-details"
              {...register("details")}
              placeholder={t("detailsPlaceholder")}
              rows={4}
              maxLength={2000}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("link.label")}</Label>
            <ObservationLinkPicker locale={locale} clientId={clientId} value={linked} onChange={setLinked} />
          </div>

          <div className="flex flex-col gap-2">
            <Label>{t("image.label")}</Label>
            {image ? (
              <div className="relative size-24">
                {image.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob/signed URL, not optimizable
                  <img src={image.preview} alt="" className="size-24 rounded-md border border-border object-cover" />
                ) : (
                  <div className="size-24 rounded-md border border-border bg-muted" />
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label={t("image.remove")}
                  className="absolute -end-2 -top-2 rounded-full"
                  onClick={() => setImage(null)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ) : (
              <label className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 text-sm text-muted-foreground hover:bg-muted">
                <ImagePlus className="size-4" />
                {uploading ? tCommon("pending") : t("image.attach")}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImage} disabled={uploading} />
              </label>
            )}
          </div>

          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={pending || uploading || !title.trim()} className="min-w-24">
              {pending ? tCommon("pending") : t("submit")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
