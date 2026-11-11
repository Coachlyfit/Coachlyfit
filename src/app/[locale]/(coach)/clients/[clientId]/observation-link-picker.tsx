"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate } from "@/lib/format";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { OBSERVATION_LINK_TYPES, type ObservationLinkType } from "@/domain/clients/observations";
import { getObservationLinkOptionsAction } from "../actions";
import { searchExercisesAction } from "../../library/actions";
import { ExerciseRow } from "../../programs/[programId]/exercise-media";

export type LinkedValue = { type: ObservationLinkType; id: string; label: string };

const rowClass = "w-full rounded-lg p-2 text-start text-sm hover:bg-muted";

function ExerciseResults({ locale, onPick }: { locale: AppLocale; onPick: (v: LinkedValue) => void }) {
  const t = useTranslations("clients.observations.link");
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const { data, isPending } = useQuery({
    queryKey: ["observations", "exercise-link", debounced],
    queryFn: () => searchExercisesAction({ query: debounced, source: "all", pageSize: 30 }),
  });
  const rows = data?.rows ?? [];
  return (
    <>
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("search")} />
      <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
        {isPending && <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>}
        {!isPending && rows.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">{t("none")}</p>}
        {rows.map((exercise) => (
          <ExerciseRow
            key={exercise.id}
            exercise={exercise}
            locale={locale}
            selected={false}
            onClick={() => onPick({ type: "exercise", id: exercise.id, label: pickLocale(exercise, locale) })}
          />
        ))}
      </div>
    </>
  );
}

/** Optional link from a note to one of the client's records. Programs and
 * check-ins come from the server section; exercises reuse the library search
 * action (same as the program item dialog's picker). */
export function ObservationLinkPicker({
  locale,
  clientId,
  value,
  onChange,
}: {
  locale: AppLocale;
  clientId: string;
  value: LinkedValue | null;
  onChange: (value: LinkedValue | null) => void;
}) {
  const t = useTranslations("clients.observations.link");
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<ObservationLinkType>("program");
  const { data: options, isPending: optionsPending } = useQuery({
    queryKey: ["observations", "link-options", clientId, locale],
    queryFn: () => getObservationLinkOptionsAction(locale, clientId),
    enabled: adding,
  });
  const programs = options?.programs ?? [];
  const checkins = options?.checkins ?? [];

  function pick(next: LinkedValue) {
    onChange(next);
    setAdding(false);
  }

  if (value) {
    return (
      <div className="flex w-fit max-w-full items-center gap-1 rounded-full bg-muted ps-3 pe-1 text-sm">
        <span className="truncate">
          <span className="text-muted-foreground">{t(value.type)}: </span>
          {value.label}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("remove")} onClick={() => onChange(null)}>
          <X className="size-3.5" />
        </Button>
      </div>
    );
  }

  if (!adding) {
    return (
      <Button type="button" variant="ghost" size="sm" className="w-fit text-muted-foreground" onClick={() => setAdding(true)}>
        <Plus className="size-4" />
        {t("add")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Segmented
          value={type}
          onChange={setType}
          label={t("label")}
          options={OBSERVATION_LINK_TYPES.map((v) => ({ value: v, label: t(v) }))}
        />
        <Button type="button" variant="ghost" size="icon-sm" aria-label={t("cancel")} onClick={() => setAdding(false)}>
          <X className="size-4" />
        </Button>
      </div>
      {type === "exercise" ? (
        <ExerciseResults locale={locale} onPick={pick} />
      ) : (
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-md border border-border p-1">
          {optionsPending ? (
            <p className="p-3 text-center text-sm text-muted-foreground">{t("loading")}</p>
          ) : (
            (type === "program" ? programs.length : checkins.length) === 0 && (
              <p className="p-3 text-center text-sm text-muted-foreground">{t("none")}</p>
            )
          )}
          {type === "program" &&
            programs.map((p) => (
              <button key={p.id} type="button" className={rowClass} onClick={() => pick({ type, id: p.id, label: p.name })}>
                {p.name}
              </button>
            ))}
          {type === "check_in" &&
            checkins.map((c) => {
              const label = formatDate(c.date, locale);
              return (
                <button key={c.id} type="button" className={rowClass} onClick={() => pick({ type, id: c.id, label })}>
                  {label}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
