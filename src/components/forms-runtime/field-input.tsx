"use client";

import { Controller, useFormContext } from "react-hook-form";
import { useLocale } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";
import { PhotoFileInput } from "./photo-file-input";

export function FieldInput({
  field,
  refOptions,
  uploadContext,
}: {
  field: FormField;
  refOptions?: LibraryRefOption[];
  uploadContext?: { coachId: string; clientId: string };
}) {
  const locale = useLocale() as AppLocale;
  const { register, control } = useFormContext();

  switch (field.type) {
    case "text":
      return <Input id={field.id} {...register(field.id)} />;

    case "textarea":
      return <Textarea id={field.id} {...register(field.id)} />;

    case "number":
      return (
        <div className="flex items-center gap-2">
          <Input id={field.id} type="number" step={field.step} {...register(field.id)} />
          {field.unit && <span className="text-sm text-muted-foreground">{field.unit}</span>}
        </div>
      );

    case "date":
      return <Input id={field.id} type="date" {...register(field.id)} />;

    case "checkbox":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <Checkbox id={field.id} checked={!!f.value} onCheckedChange={f.onChange} />
          )}
        />
      );

    case "scale": {
      const min = field.min ?? 1;
      const max = field.max ?? 5;
      const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <RadioGroup
              value={f.value ? String(f.value) : undefined}
              onValueChange={(v) => f.onChange(Number(v))}
              className="flex gap-3"
            >
              {values.map((v) => (
                <div key={v} className="flex flex-col items-center gap-1">
                  <RadioGroupItem value={String(v)} id={`${field.id}-${v}`} />
                  <label htmlFor={`${field.id}-${v}`} className="text-xs text-muted-foreground">
                    {v}
                  </label>
                </div>
              ))}
            </RadioGroup>
          )}
        />
      );
    }

    case "select":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <Select value={f.value} onValueChange={f.onChange}>
              <SelectTrigger id={field.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(field.options ?? []).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {pickLocale(o.label, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );

    case "radio":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <RadioGroup value={f.value} onValueChange={f.onChange} className="flex flex-col gap-2">
              {(field.options ?? []).map((o) => (
                <div key={o.value} className="flex items-center gap-2">
                  <RadioGroupItem value={o.value} id={`${field.id}-${o.value}`} />
                  <label htmlFor={`${field.id}-${o.value}`} className="text-sm">
                    {pickLocale(o.label, locale)}
                  </label>
                </div>
              ))}
            </RadioGroup>
          )}
        />
      );

    case "multiselect":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => {
            const current: string[] = f.value ?? [];
            return (
              <div className="flex flex-col gap-2">
                {(field.options ?? []).map((o) => (
                  <div key={o.value} className="flex items-center gap-2">
                    <Checkbox
                      id={`${field.id}-${o.value}`}
                      checked={current.includes(o.value)}
                      onCheckedChange={(checked) =>
                        f.onChange(
                          checked ? [...current, o.value] : current.filter((v) => v !== o.value)
                        )
                      }
                    />
                    <label htmlFor={`${field.id}-${o.value}`} className="text-sm">
                      {pickLocale(o.label, locale)}
                    </label>
                  </div>
                ))}
              </div>
            );
          }}
        />
      );

    case "exercise_ref":
    case "food_ref":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <Select value={f.value} onValueChange={f.onChange}>
              <SelectTrigger id={field.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(refOptions ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {pickLocale(o, locale)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      );

    case "photo":
    case "file":
      return (
        <Controller
          name={field.id}
          control={control}
          render={({ field: f }) => (
            <PhotoFileInput
              value={f.value}
              onChange={f.onChange}
              accept={field.type === "photo" ? "image/*" : undefined}
              uploadContext={uploadContext}
            />
          )}
        />
      );

    case "section":
      return null;
  }
}
