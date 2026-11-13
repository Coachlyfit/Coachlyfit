"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/** Chips input: Enter or comma adds the typed tag, Backspace on an empty
 * input removes the last one. Case-insensitive duplicates are ignored here;
 * the schema dedupes again on save. */
export function TagsInput({
  id,
  value,
  onChange,
  invalid,
  describedBy,
  max = 8,
  maxLength = 24,
  placeholder,
  tone = "secondary",
  inputRef,
}: {
  id: string;
  value: string[];
  onChange: (tags: string[]) => void;
  invalid?: boolean;
  describedBy?: string;
  /** Defaults are the recipe form's limits; the exercise form passes its own. */
  max?: number;
  maxLength?: number;
  placeholder?: string;
  tone?: "secondary" | "info";
  inputRef?: React.Ref<HTMLInputElement>;
}) {
  const t = useTranslations("recipes.form");
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const tag = text.trim();
    setDraft("");
    if (!tag || value.some((v) => v.toLowerCase() === tag.toLowerCase()) || value.length >= max) return;
    onChange([...value, tag.slice(0, maxLength)]);
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag}>
              <Badge variant={tone} className="gap-1 pe-1">
                {tag}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((v) => v !== tag))}
                  aria-label={t("removeTag", { tag })}
                  className="rounded-full p-0.5 hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </Badge>
            </li>
          ))}
        </ul>
      )}
      <Input
        id={id}
        ref={inputRef}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder ?? t("tagsPlaceholder")}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={value.length >= max}
        onChange={(e) => {
          if (e.target.value.endsWith(",") || e.target.value.endsWith("،")) {
            commit(e.target.value.slice(0, -1));
          } else {
            setDraft(e.target.value);
          }
        }}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
