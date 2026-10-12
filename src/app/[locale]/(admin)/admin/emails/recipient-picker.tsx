"use client";

import { useTranslations } from "next-intl";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type CoachOption = {
  coachId: string;
  name: string;
  ownerName: string | null;
  status: string | null;
};

/** Searchable multi-select of coaches. Works on ids only -- the option list
 * has no email addresses. */
export function RecipientPicker({
  coaches,
  value,
  onChange,
}: {
  coaches: CoachOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("admin.emails.picker");
  const selected = new Set(value);

  function toggle(coachId: string) {
    onChange(selected.has(coachId) ? value.filter((id) => id !== coachId) : [...value, coachId]);
  }

  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" variant="outline" className="w-full justify-between font-normal" />}>
        <span className="truncate">{value.length === 0 ? t("placeholder") : t("selected", { count: value.length })}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={t("search")} />
          <CommandList>
            <CommandEmpty>{t("empty")}</CommandEmpty>
            {coaches.map((coach) => (
              <CommandItem
                key={coach.coachId}
                // cmdk filters on `value`; the id keeps two same-named coaches apart.
                value={`${coach.name} ${coach.ownerName ?? ""} ${coach.coachId}`}
                data-checked={selected.has(coach.coachId)}
                onSelect={() => toggle(coach.coachId)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{coach.name}</span>
                  {coach.ownerName && <span className="truncate text-xs text-muted-foreground">{coach.ownerName}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
