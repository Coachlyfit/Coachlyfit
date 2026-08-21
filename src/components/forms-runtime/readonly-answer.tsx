import { pickLocale, pickBilingual, type AppLocale } from "@/domain/locale";
import type { FormField } from "@/domain/forms/schema";
import type { LibraryRefOption } from "@/domain/forms/library-refs";

export function ReadonlyAnswer({
  field,
  value,
  locale,
  refOptions,
}: {
  field: FormField;
  value: unknown;
  locale: AppLocale;
  refOptions?: LibraryRefOption[];
}) {
  if (value === undefined || value === null || value === "") {
    return <span className="text-sm italic text-muted-foreground">—</span>;
  }

  if (field.type === "checkbox") {
    return <span className="text-sm">{value ? "✓" : "—"}</span>;
  }

  if (field.type === "select" || field.type === "radio") {
    const option = field.options?.find((o) => o.value === value);
    return <span className="text-sm">{option ? pickBilingual(option.label, locale) : String(value)}</span>;
  }

  if (field.type === "multiselect" && Array.isArray(value)) {
    const labels = value.map((v) => {
      const option = field.options?.find((o) => o.value === v);
      return option ? pickBilingual(option.label, locale) : v;
    });
    return <span className="text-sm">{labels.join(", ")}</span>;
  }

  if (field.type === "scale") {
    return (
      <span className="text-sm tabular-nums">
        {String(value)} / {field.max ?? 5}
      </span>
    );
  }

  if (field.type === "photo" && typeof value === "string") {
    return <span className="text-sm text-muted-foreground">{value.split("/").pop()}</span>;
  }

  if ((field.type === "exercise_ref" || field.type === "food_ref") && typeof value === "string") {
    const ref = refOptions?.find((o) => o.id === value);
    return <span className="text-sm">{ref ? pickLocale(ref, locale) : value}</span>;
  }

  return <span className="text-sm">{String(value)}</span>;
}
