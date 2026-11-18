"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { DietPlanDay } from "@/domain/nutrition/diet-plans.service";
import { usePathname, useRouter } from "@/i18n/navigation";
import { deleteDayAction, duplicateDayAction } from "../actions";
import { DayDialog } from "./day-dialog";

/** [Training] [Rest] [custom…] [+ Add day] — one tab per plan day. The
 * selected day lives in `?day=` (the page renders only that day's meals), so
 * switching is a navigation, same as the client profile's tabs. Rename /
 * duplicate / delete act on the selected day. */
export function DayTabs({
  locale,
  dietPlanId,
  days,
  activeId,
}: {
  locale: AppLocale;
  dietPlanId: string;
  days: DietPlanDay[];
  activeId: string;
}) {
  const t = useTranslations("diets.days");
  const tErrors = useTranslations("diets.errors");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"add" | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const active = days.find((d) => d.id === activeId) ?? days[0];

  function select(dayId: string | null) {
    startTransition(() => router.replace(dayId ? `${pathname}?day=${dayId}` : pathname, { scroll: false }));
  }

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateDayAction(locale, dietPlanId, active.id);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      router.replace(`${pathname}?day=${result.id}`, { scroll: false });
    });
  }

  function remove() {
    setConfirmDelete(false);
    startTransition(async () => {
      const result = await deleteDayAction(locale, dietPlanId, active.id);
      if (result?.error) {
        toast.error(tErrors(result.error));
        return;
      }
      router.replace(pathname, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs
        value={active.id}
        onValueChange={(next) => typeof next === "string" && select(next)}
        className="min-w-0 max-w-full"
      >
        <div className="max-w-full overflow-x-auto">
          <TabsList variant="line" className={pending ? "opacity-60" : undefined}>
            {days.map((day) => (
              <TabsTrigger key={day.id} value={day.id} className="flex-none">
                {pickLocale(day, locale)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </Tabs>

      <Button type="button" variant="outline" size="sm" onClick={() => setDialog("add")}>
        <Plus className="size-4" />
        {t("addDay")}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("dayActions")} />}>
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDialog("edit")}>
            <Pencil className="size-4" />
            {t("editDay")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={duplicate}>
            <Copy className="size-4" />
            {t("duplicateDay")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={days.length <= 1} onClick={() => setConfirmDelete(true)}>
            <Trash2 className="size-4" />
            {t("deleteDay")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog && (
        <DayDialog
          // Remount per target so the form starts from that day's values.
          key={dialog === "edit" ? active.id : "add"}
          locale={locale}
          dietPlanId={dietPlanId}
          day={dialog === "edit" ? active : undefined}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          onSaved={(dayId) => dialog === "add" && select(dayId)}
        />
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("confirmDeleteTitle", { name: pickLocale(active, locale) })}
        description={t("confirmDeleteBody")}
        confirmLabel={t("deleteDay")}
        onConfirm={remove}
      />
    </div>
  );
}
