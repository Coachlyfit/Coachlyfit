"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MAX_ALTERNATIVES, type AlternativeExercise } from "@/domain/alternatives/alternatives.service";
import { searchExercisesAction } from "@/domain/library/library-actions";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { cn } from "@/lib/utils";

export type AlternativeRef = Pick<AlternativeExercise, "id" | "name_ar" | "name_en" | "muscle_group" | "equipment">;

/** Ordered list of alternative exercises: search-to-add (optionally limited
 * to the same muscle group) and drag/keyboard reorder. Controlled: the
 * parent owns `value` and decides when to save (library form: with the
 * exercise; program builder: with the item). */
export function AlternativesEditor({
  locale,
  exerciseId,
  muscleGroup,
  value,
  onChange,
  disabled,
}: {
  locale: AppLocale;
  /** The exercise the alternatives are for; never offered as its own alternative. */
  exerciseId?: string;
  /** Default scope of the search (the "same muscle group" switch). */
  muscleGroup?: string | null;
  value: AlternativeRef[];
  onChange: (next: AlternativeRef[]) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("alternatives");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sameGroup, setSameGroup] = useState(!!muscleGroup);
  const debounced = useDebouncedValue(query.trim(), 250);
  const group = sameGroup ? muscleGroup : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data, isPending, isFetching } = useQuery({
    queryKey: ["alternatives", "search", group ?? null, debounced],
    queryFn: () => searchExercisesAction({ query: debounced, group, source: "all", pageSize: 30 }),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const chosen = new Set(value.map((v) => v.id));
  const results = (data?.rows ?? []).filter((e) => e.id !== exerciseId && !chosen.has(e.id));
  const full = value.length >= MAX_ALTERNATIVES;

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = value.findIndex((v) => v.id === active.id);
    const to = value.findIndex((v) => v.id === over.id);
    if (from !== -1 && to !== -1) onChange(arrayMove(value, from, to));
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={value.map((v) => v.id)} strategy={verticalListSortingStrategy}>
            <ol className="flex flex-col gap-1.5">
              {value.map((alt, index) => (
                <AlternativeRow
                  key={alt.id}
                  alt={alt}
                  index={index}
                  locale={locale}
                  disabled={disabled}
                  onRemove={() => onChange(value.filter((v) => v.id !== alt.id))}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger
          render={<Button type="button" variant="outline" size="sm" disabled={disabled || full} className="self-start" />}
        >
          <Plus className="size-4" aria-hidden="true" />
          {full ? t("limitReached", { max: MAX_ALTERNATIVES }) : t("add")}
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(26rem,calc(100vw-2rem))] p-0">
          <Command shouldFilter={false}>
            <CommandInput value={query} onValueChange={setQuery} placeholder={t("searchPlaceholder")} aria-label={t("searchPlaceholder")} />
            {muscleGroup && (
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <Switch id="alt-same-group" size="sm" checked={sameGroup} onCheckedChange={setSameGroup} />
                <Label htmlFor="alt-same-group" className="text-xs font-normal">
                  {t("sameMuscleGroup")}
                </Label>
              </div>
            )}
            <CommandList aria-busy={isFetching}>
              {isPending ? (
                <p className="py-6 text-center text-sm text-muted-foreground">{t("searching")}</p>
              ) : (
                <CommandEmpty>{t("noResults")}</CommandEmpty>
              )}
              <CommandGroup>
                {results.map((e) => (
                  <CommandItem
                    key={e.id}
                    value={e.id}
                    onSelect={() => {
                      onChange([...value, e]);
                      if (value.length + 1 >= MAX_ALTERNATIVES) setOpen(false);
                    }}
                  >
                    <span className="truncate">{pickLocale(e, locale)}</span>
                    {e.equipment && <span className="ms-auto truncate text-xs text-muted-foreground">{e.equipment}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function AlternativeRow({
  alt,
  index,
  locale,
  disabled,
  onRemove,
}: {
  alt: AlternativeRef;
  index: number;
  locale: AppLocale;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations("alternatives");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: alt.id, disabled });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5", isDragging && "z-10 opacity-70")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={t("dragHandle", { name: pickLocale(alt, locale) })}
        className="shrink-0 cursor-grab touch-none rounded text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-5 shrink-0 text-center font-mono text-xs tabular-nums text-muted-foreground">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{pickLocale(alt, locale)}</span>
      {alt.equipment && (
        <Badge variant="secondary" className="hidden shrink-0 sm:inline-flex">
          {alt.equipment}
        </Badge>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        onClick={onRemove}
        aria-label={t("remove", { name: pickLocale(alt, locale) })}
        className="shrink-0 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}
