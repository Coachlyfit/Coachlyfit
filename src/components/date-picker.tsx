"use client";

import { useState } from "react";
import {
  useController,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { useLocale, useTranslations } from "next-intl";
import { ar, enUS } from "react-day-picker/locale";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// Values are "YYYY-MM-DD" strings. Parse/serialize by hand (not toISOString)
// so the picked day never shifts with the viewer's timezone.
function parseYmd(v?: string | null) {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : undefined;
}

function toYmd(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function DatePicker({
  value,
  onChange,
  onBlur,
  id,
  invalid,
  className,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  onBlur?: () => void;
  id?: string;
  invalid?: boolean;
  className?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("common");
  const [open, setOpen] = useState(false);

  const selected = parseYmd(value);
  const isAr = locale === "ar";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            data-empty={!selected}
            aria-invalid={invalid}
            onBlur={onBlur}
            className={cn(
              "h-10 w-full justify-between font-normal data-[empty=true]:text-muted-foreground md:h-8",
              className,
            )}
          />
        }
      >
        <span className="truncate">
          {selected ? selected.toLocaleDateString(locale, { dateStyle: "long" }) : t("pickDate")}
        </span>
        <CalendarIcon className="size-4 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(d) => {
            onChange(d ? toYmd(d) : "");
            setOpen(false);
          }}
          locale={isAr ? ar : enUS}
          dir={isAr ? "rtl" : "ltr"}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}

/** react-hook-form binding: `<FormDatePicker control={control} name="start_date" />`. */
export function FormDatePicker<T extends FieldValues>({
  control,
  name,
  ...props
}: {
  control: Control<T>;
  name: FieldPath<T>;
  id?: string;
  className?: string;
}) {
  const { field, fieldState } = useController({ control, name });
  return (
    <DatePicker
      {...props}
      value={field.value}
      onChange={field.onChange}
      onBlur={field.onBlur}
      invalid={!!fieldState.error}
    />
  );
}
