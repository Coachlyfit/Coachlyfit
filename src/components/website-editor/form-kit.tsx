"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useForm, type DefaultValues, type FieldValues, type Resolver, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import type { z } from "zod";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** React Hook Form for one editor section, wired to the live draft: every
 * edit that passes the section's zod schema is handed to `onValid` (which
 * updates the preview and schedules the autosave). Edits that don't validate
 * stay in the form, with their error, and are never saved or previewed. */
export function useSectionForm<T extends FieldValues>(
  schema: z.ZodType<T>,
  initial: T,
  onValid: (value: T) => void
): UseFormReturn<T> {
  const form = useForm<T>({
    resolver: zodResolver(schema as never) as Resolver<T>,
    defaultValues: initial as DefaultValues<T>,
    mode: "onChange",
  });
  const last = useRef(JSON.stringify(initial));
  const emit = useRef(onValid);
  useEffect(() => {
    emit.current = onValid;
  });

  useEffect(() => {
    const sub = form.watch((values) => {
      const parsed = schema.safeParse(values);
      if (!parsed.success) return;
      const serialized = JSON.stringify(parsed.data);
      if (serialized === last.current) return;
      last.current = serialized;
      emit.current(parsed.data);
    });
    return () => sub.unsubscribe();
  }, [form, schema]);

  return form;
}

/** aria-describedby for a control: its hint and/or its error. */
export const describedBy = (id: string, hasHint: boolean, hasError: boolean) =>
  [hasHint ? `${id}-hint` : null, hasError ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;

/** Label + control + hint + error (+ optional character counter). The control
 * is rendered by the caller so it can take any input type; give it the same
 * `id` and `aria-describedby={describedBy(...)}`. */
export function Field({
  id,
  label,
  hint,
  error,
  count,
  max,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  count?: number;
  max?: number;
  className?: string;
  children: ReactNode;
}) {
  const t = useTranslations("websiteEditor.form");
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {max !== undefined && count !== undefined && (
          <span
            className={cn("font-mono text-xs tabular-nums", count > max ? "text-destructive" : "text-muted-foreground")}
            aria-hidden="true"
          >
            {t("counter", { n: count, max })}
          </span>
        )}
      </div>
      {children}
      {hint && (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Localized message for a zod error, picked by what the field is. */
export function useFieldError() {
  const t = useTranslations("websiteEditor.errors");
  return (error: { type?: string; message?: string } | undefined, kind: "text" | "phone" | "url" = "text") => {
    if (!error) return undefined;
    if (kind === "phone") return t("phone");
    if (kind === "url") return t("url");
    return error.type === "too_big" ? t("tooLong") : t("invalid");
  };
}

/** Plain native <select> in the same shell as Input. */
export const selectClass =
  "h-11.5 w-full rounded-[10px] border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
