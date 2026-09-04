"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formTemplateSchema, type FormField } from "@/domain/forms/schema";
import { FormRenderer } from "@/components/forms-runtime/form-renderer";
import { useBuilderStore } from "./builder-store";
import { FieldPalette } from "./field-palette";
import { Canvas } from "./canvas";
import { Inspector } from "./inspector";

function draftKey(templateId: string) {
  return `form-draft:${templateId}`;
}

export function Builder({
  templateId,
  initialFields,
  onPublish,
}: {
  templateId: string;
  initialFields: FormField[];
  onPublish: (fields: FormField[]) => Promise<{ error: string } | void>;
}) {
  const t = useTranslations("forms.builder");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("forms.errors");
  const fields = useBuilderStore((s) => s.fields);
  const load = useBuilderStore((s) => s.load);
  const [preview, setPreview] = useState(false);
  const [pending, startTransition] = useTransition();
  const loadedRef = useRef(false);

  // Load once per template: prefer an unsaved local draft over the last
  // published version, so a browser refresh mid-edit doesn't lose work.
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(draftKey(templateId)) : null;
    if (raw) {
      try {
        load(JSON.parse(raw) as FormField[]);
        return;
      } catch {
        // fall through to initialFields
      }
    }
    load(initialFields);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = setTimeout(() => {
      window.localStorage.setItem(draftKey(templateId), JSON.stringify(fields));
    }, 500);
    return () => clearTimeout(timer);
  }, [fields, templateId]);

  function handlePublish() {
    const parsed = formTemplateSchema.safeParse({ version: 1, fields });
    if (!parsed.success) {
      toast.error(tErrors("invalid_input"));
      return;
    }
    startTransition(async () => {
      const result = await onPublish(fields);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      window.localStorage.removeItem(draftKey(templateId));
      toast.success(t("published"));
    });
  }

  return (
    <div className="flex h-[calc(100dvh-8rem)] flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">{t("autosaved")}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreview((p) => !p)}>
            {preview ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {t("preview")}
          </Button>
          <Button type="button" size="sm" onClick={handlePublish} disabled={pending} className="min-w-24">
            <Save className="size-4" />
            {pending ? tCommon("pending") : t("publish")}
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-lg">
            <FormRenderer fields={fields} mode="preview" />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          <FieldPalette />
          <Canvas />
          <Inspector />
        </div>
      )}
    </div>
  );
}
