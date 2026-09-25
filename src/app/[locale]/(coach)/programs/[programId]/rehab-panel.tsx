"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { pickLocale, type AppLocale } from "@/domain/locale";
import type { ProgramTree } from "@/domain/programs/programs.service";
import { formatDate } from "@/lib/format";
import { rehabProtocolSchema, rehabPhaseSchema, type RehabProtocolInput, type RehabPhaseFormInput } from "../schemas";
import {
  addRehabProtocolAction,
  updateRehabProtocolAction,
  deleteRehabProtocolAction,
  addRehabPhaseAction,
  deleteRehabPhaseAction,
} from "../actions";

type Protocol = ProgramTree["rehab_protocols"][number];

function weekToDate(startDate: string, week: number): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  const date = new Date(start.getTime() + (week - 1) * 7 * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function PhaseForm({
  locale,
  programId,
  protocolId,
  onDone,
}: {
  locale: string;
  programId: string;
  protocolId: string;
  onDone: () => void;
}) {
  const t = useTranslations("programs.rehab");
  const tErrors = useTranslations("programs.errors");
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset } = useForm<RehabPhaseFormInput>({
    resolver: zodResolver(rehabPhaseSchema),
    defaultValues: { from_week: 1, to_week: 2 },
  });

  const onSubmit = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("name_ar", data.name_ar);
    formData.set("name_en", data.name_en);
    formData.set("from_week", String(data.from_week));
    formData.set("to_week", String(data.to_week));
    if (data.goals_ar) formData.set("goals_ar", data.goals_ar);
    if (data.goals_en) formData.set("goals_en", data.goals_en);
    if (data.progression_criteria_ar) formData.set("progression_criteria_ar", data.progression_criteria_ar);
    if (data.progression_criteria_en) formData.set("progression_criteria_en", data.progression_criteria_en);

    startTransition(async () => {
      const result = await addRehabPhaseAction(locale, programId, protocolId, formData);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      reset();
      onDone();
    });
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 rounded-md border border-border p-2">
      <div className="grid grid-cols-2 gap-2">
        <Input dir="rtl" placeholder={t("phaseNameAr")} {...register("name_ar")} />
        <Input dir="ltr" placeholder={t("phaseNameEn")} {...register("name_en")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs">{t("fromWeek")}</Label>
          <Input type="number" min={1} max={12} {...register("from_week")} />
        </div>
        <div className="flex items-center gap-2">
          <Label className="shrink-0 text-xs">{t("toWeek")}</Label>
          <Input type="number" min={1} max={12} {...register("to_week")} />
        </div>
      </div>
      <Textarea dir="rtl" rows={2} placeholder={t("goalsAr")} {...register("goals_ar")} />
      <Textarea dir="ltr" rows={2} placeholder={t("goalsEn")} {...register("goals_en")} />
      <Button type="submit" size="sm" disabled={pending}>
        {t("addPhase")}
      </Button>
    </form>
  );
}

function ProtocolCard({
  locale,
  programId,
  programStartDate,
  protocol,
}: {
  locale: AppLocale;
  programId: string;
  programStartDate: string;
  protocol: Protocol;
}) {
  const t = useTranslations("programs.rehab");
  const tErrors = useTranslations("programs.errors");
  const [expanded, setExpanded] = useState(false);
  const [addingPhase, setAddingPhase] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const { register, handleSubmit } = useForm<RehabProtocolInput>({
    resolver: zodResolver(rehabProtocolSchema),
    defaultValues: {
      body_area: protocol.body_area,
      injury_ar: protocol.injury_ar ?? "",
      injury_en: protocol.injury_en ?? "",
      restrictions_ar: protocol.restrictions_ar ?? "",
      restrictions_en: protocol.restrictions_en ?? "",
      instructions_ar: protocol.instructions_ar ?? "",
      instructions_en: protocol.instructions_en ?? "",
    },
  });

  const onSave = handleSubmit((data) => {
    const formData = new FormData();
    formData.set("body_area", data.body_area);
    if (data.injury_ar) formData.set("injury_ar", data.injury_ar);
    if (data.injury_en) formData.set("injury_en", data.injury_en);
    if (data.restrictions_ar) formData.set("restrictions_ar", data.restrictions_ar);
    if (data.restrictions_en) formData.set("restrictions_en", data.restrictions_en);
    if (data.instructions_ar) formData.set("instructions_ar", data.instructions_ar);
    if (data.instructions_en) formData.set("instructions_en", data.instructions_en);

    startTransition(async () => {
      const result = await updateRehabProtocolAction(locale, programId, protocol.id, formData);
      if (result?.error) toast.error(tErrors(result.error));
    });
  });

  async function confirmDelete() {
    const result = await deleteRehabProtocolAction(locale, programId, protocol.id);
    if (result?.error) toast.error(tErrors(result.error));
    setPendingDelete(false);
  }

  async function removePhase(phaseId: string) {
    const result = await deleteRehabPhaseAction(locale, programId, phaseId);
    if (result?.error) toast.error(tErrors(result.error));
  }

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-2 text-start text-sm font-medium"
      >
        {protocol.body_area}
        {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 border-t border-border p-2">
          <form onSubmit={onSave} className="flex flex-col gap-2">
            <Input placeholder={t("bodyArea")} {...register("body_area")} />
            <Textarea dir="rtl" rows={2} placeholder={t("injuryAr")} {...register("injury_ar")} />
            <Textarea dir="ltr" rows={2} placeholder={t("injuryEn")} {...register("injury_en")} />
            <Textarea dir="rtl" rows={2} placeholder={t("restrictionsAr")} {...register("restrictions_ar")} />
            <Textarea dir="ltr" rows={2} placeholder={t("restrictionsEn")} {...register("restrictions_en")} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {t("saveProtocol")}
            </Button>
          </form>

          <div className="flex flex-col gap-1 border-t border-border pt-2">
            <p className="text-xs font-medium text-muted-foreground">{t("phases")}</p>
            {protocol.rehab_phases.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("noPhases")}</p>
            )}
            {protocol.rehab_phases.map((phase) => (
              <div key={phase.id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{pickLocale(phase, locale)}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">
                    {formatDate(weekToDate(programStartDate, phase.from_week), locale)} –{" "}
                    {formatDate(weekToDate(programStartDate, phase.to_week), locale)}
                  </p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => removePhase(phase.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {addingPhase ? (
              <PhaseForm locale={locale} programId={programId} protocolId={protocol.id} onDone={() => setAddingPhase(false)} />
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setAddingPhase(true)}>
                <Plus className="size-4" />
                {t("addPhase")}
              </Button>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start text-destructive hover:text-destructive"
            onClick={() => setPendingDelete(true)}
          >
            <Trash2 className="size-4" />
            {t("deleteProtocol")}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={pendingDelete}
        onOpenChange={setPendingDelete}
        title={t("deleteProtocol")}
        confirmLabel={t("deleteProtocol")}
        onConfirm={confirmDelete}
      />
    </div>
  );
}

export function RehabPanel({
  locale,
  programId,
  programStartDate,
  protocols,
}: {
  locale: AppLocale;
  programId: string;
  programStartDate: string;
  protocols: Protocol[];
}) {
  const t = useTranslations("programs.rehab");
  const tErrors = useTranslations("programs.errors");
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const { register, handleSubmit, reset } = useForm<{ body_area: string }>({ defaultValues: { body_area: "" } });

  const onAdd = handleSubmit((data) => {
    if (!data.body_area) return;
    const formData = new FormData();
    formData.set("body_area", data.body_area);
    startTransition(async () => {
      const result = await addRehabProtocolAction(locale, programId, formData);
      if ("error" in result) {
        toast.error(tErrors(result.error));
        return;
      }
      reset();
      setAdding(false);
    });
  });

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t("title")}</h3>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus className="size-4" />
          {t("newProtocol")}
        </Button>
      </div>

      {adding && (
        <form onSubmit={onAdd} className="flex gap-2">
          <Input placeholder={t("bodyAreaPlaceholder")} {...register("body_area")} />
          <Button type="submit" size="sm" disabled={pending}>
            {t("create")}
          </Button>
        </form>
      )}

      {protocols.length === 0 ? (
        <p className="py-2 text-center text-xs text-muted-foreground">{t("noProtocols")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {protocols.map((protocol) => (
            <ProtocolCard
              key={protocol.id}
              locale={locale}
              programId={programId}
              programStartDate={programStartDate}
              protocol={protocol}
            />
          ))}
        </div>
      )}
    </div>
  );
}
