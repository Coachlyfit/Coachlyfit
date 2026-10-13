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

/** A lead as the composer needs it. Unsubscribed leads never get here. */
export type LeadOption = { id: string; name: string | null; email: string };

type Option = { id: string; title: string; subtitle: string | null };

/** Searchable multi-select of coaches, or of leads with `leads`. Works on ids
 * only -- the coach list has no email addresses. The leads variant adds
 * select all / clear, since outreach usually goes to the whole short list. */
export function RecipientPicker({
  coaches = [],
  leads,
  value,
  onChange,
}: {
  coaches?: CoachOption[];
  leads?: LeadOption[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations(leads ? "admin.emails.leadPicker" : "admin.emails.picker");
  const selected = new Set(value);
  const options: Option[] = leads
    ? leads.map((lead) => ({ id: lead.id, title: lead.name ?? lead.email, subtitle: lead.name ? lead.email : null }))
    : coaches.map((coach) => ({ id: coach.coachId, title: coach.name, subtitle: coach.ownerName }));

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((other) => other !== id) : [...value, id]);
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
          {leads && leads.length > 0 && (
            <div className="flex gap-1 px-1 pt-1">
              <Button type="button" variant="ghost" size="xs" onClick={() => onChange(leads.map((lead) => lead.id))}>
                {t("selectAll")}
              </Button>
              <Button type="button" variant="ghost" size="xs" disabled={value.length === 0} onClick={() => onChange([])}>
                {t("clear")}
              </Button>
            </div>
          )}
          <CommandList>
            <CommandEmpty>{t("empty")}</CommandEmpty>
            {options.map((option) => (
              <CommandItem
                key={option.id}
                // cmdk filters on `value`; the id keeps two same-named options apart.
                value={`${option.title} ${option.subtitle ?? ""} ${option.id}`}
                data-checked={selected.has(option.id)}
                onSelect={() => toggle(option.id)}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{option.title}</span>
                  {option.subtitle && <span className="truncate text-xs text-muted-foreground">{option.subtitle}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
