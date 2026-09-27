"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Eye, EyeOff, ListPlus, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  const selectedId = useBuilderStore((s) => s.selectedId);
  const select = useBuilderStore((s) => s.select);
  const [preview, setPreview] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <span className="text-xs text-muted-foreground">{t("autosaved")}</span>
        <div className="flex gap-2">
          {!preview && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="lg:hidden"
              onClick={() => setPaletteOpen(true)}
            >
              <ListPlus className="size-4" />
              {t("palette")}
            </Button>
          )}
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
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <FieldPalette className="hidden lg:flex" />
          <Canvas />
          <Inspector className="hidden lg:flex" />
        </div>
      )}

      {/* Below `lg` the palette and inspector aren't roomy enough to sit
       * beside the canvas (see the audit) — they become bottom sheets
       * instead: "Add field" above opens this one, and selecting a field
       * on the canvas opens the inspector one automatically (selectedId
       * driving both `!!field` here and this sheet's `open` keeps every
       * screen size on one selection model instead of a mobile-only one). */}
      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="bottom" className="lg:hidden">
          <SheetHeader>
            <SheetTitle>{t("palette")}</SheetTitle>
          </SheetHeader>
          <FieldPalette className="w-full border-e-0 p-0" onAdd={() => setPaletteOpen(false)} />
        </SheetContent>
      </Sheet>
      <Sheet open={!preview && selectedId != null} onOpenChange={(open) => !open && select(null)}>
        <SheetContent side="bottom" className="lg:hidden">
          <Inspector className="w-full border-s-0 p-0" />
        </SheetContent>
      </Sheet>
    </div>
  );
}
