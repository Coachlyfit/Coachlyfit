"use client";

import { useRef } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useTranslations } from "next-intl";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScaleButtons } from "@/components/ui/scale-buttons";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { NumericPad } from "./numeric-pad";
import { FieldInput } from "./field-input";
import { useMediaUpload } from "./photo-file-input";

/** Step-shaped input for the design's three bespoke types (number, scale,
 * textarea) plus a camera-styled capture for photo. Everything else falls
 * through to the existing FieldInput — no reason to re-teach select/radio/
 * multiselect/date/checkbox/refs/file how to render themselves. */
export function StepFieldInput({
  field,
  refOptions,
  uploadContext,
  delta,
}: {
  field: FormField;
  refOptions?: LibraryRefOption[];
  uploadContext?: { coachId: string; clientId: string };
  delta?: number;
}) {
  const { control } = useFormContext();

  if (field.type === "number") {
    return (
      <Controller
        name={field.id}
        control={control}
        render={({ field: f }) => (
          <NumericPad
            value={f.value}
            onChange={f.onChange}
            unit={field.unit}
            integer={field.step !== undefined && Number.isInteger(field.step) && field.step >= 1}
            delta={delta}
          />
        )}
      />
    );
  }

  if (field.type === "scale") {
    const min = field.min ?? 1;
    const max = field.max ?? 5;
    return (
      <Controller
        name={field.id}
        control={control}
        render={({ field: f }) => <ScaleButtons value={f.value} onChange={f.onChange} min={min} max={max} />}
      />
    );
  }

  if (field.type === "textarea") {
    return <FieldInput field={field} refOptions={refOptions} uploadContext={uploadContext} />;
  }

  if (field.type === "photo") {
    return <PhotoCaptureStep field={field} uploadContext={uploadContext} />;
  }

  return <FieldInput field={field} refOptions={refOptions} uploadContext={uploadContext} />;
}

function PhotoCaptureStep({
  field,
  uploadContext,
}: {
  field: FormField;
  uploadContext?: { coachId: string; clientId: string };
}) {
  const { control } = useFormContext();
  const t = useTranslations("forms.fill.photo");
  const inputRef = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload(uploadContext);

  return (
    <Controller
      name={field.id}
      control={control}
      render={({ field: f }) => (
        <div className="flex flex-col items-center gap-5">
          <div className="relative aspect-[120/260] w-full max-w-52 overflow-hidden rounded-2xl bg-slate-950">
            <svg
              viewBox="0 0 120 260"
              className="absolute inset-0 m-auto h-[90%] w-[90%] opacity-50"
              fill="none"
            >
              <ellipse cx="60" cy="34" rx="21" ry="25" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
              <path d="M32 78 h56 v92 h-56 z" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
              <path d="M32 82 L14 158 M88 82 L106 158" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
              <path d="M45 170 L41 250 M75 170 L79 250" stroke="#EA580C" strokeWidth="1.6" strokeDasharray="5 5" />
            </svg>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-1/3 h-px bg-white/10" />
              <div className="absolute inset-x-0 top-2/3 h-px bg-white/10" />
              <div className="absolute inset-y-0 start-1/3 w-px bg-white/10" />
              <div className="absolute inset-y-0 start-2/3 w-px bg-white/10" />
            </div>
            {f.value && (
              <span className="absolute bottom-3 start-1/2 -translate-x-1/2 rounded-md bg-slate-950/80 px-2.5 py-1 font-mono text-[10px] tracking-wider text-slate-300">
                {t("retake")}
              </span>
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground">{t("hint")}</p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const path = await upload(file);
              if (path) f.onChange(path);
            }}
          />
          <div className="flex items-center gap-6">
            {!field.required && (
              <Button type="button" variant="outline" onClick={() => f.onChange(undefined)}>
                {t("skip")}
              </Button>
            )}
            <button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              className="flex size-18 items-center justify-center rounded-full border-4 border-foreground bg-primary text-primary-foreground disabled:opacity-50"
            >
              <Camera className="size-6" />
            </button>
          </div>
        </div>
      )}
    />
  );
}
