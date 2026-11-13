"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  GROUP_KINDS,
  defaultGroupConfig,
  isTimedKind,
  type GroupConfig,
  type GroupKind,
} from "@/domain/programs/group-config";

type Result = { error: string } | void;

/** Picks a group's format: the untimed round-robin kinds (superset / circuit /
 * giant set) or a timed one (AMRAP / EMOM / For Time / Tabata) with the
 * numbers its clock needs. Used both to create a group from the selected
 * items and to edit an existing group's format — the caller decides which by
 * what `onConfirm` does. The server re-validates (groupFormatSchema). */
export function GroupFormatDialog({
  open,
  onOpenChange,
  initialKind,
  initialConfig,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKind: GroupKind;
  initialConfig: GroupConfig | null;
  onConfirm: (kind: GroupKind, config: GroupConfig | null) => Promise<Result>;
}) {
  const t = useTranslations("programs.builder.groupFormat");
  const tErrors = useTranslations("programs.errors");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<GroupKind>(initialKind);
  const [error, setError] = useState<string | null>(null);
  // Strings, so a half-typed field is representable. Time cap is entered in
  // minutes (coaches think "12-minute AMRAP"), everything else in seconds.
  const [capMin, setCapMin] = useState(() => toMin(initialConfig?.time_cap_s));
  const [rounds, setRounds] = useState(() => str(initialConfig?.rounds));
  const [intervalS, setIntervalS] = useState(() => str(initialConfig?.interval_s));
  const [workS, setWorkS] = useState(() => str(initialConfig?.work_s));
  const [restS, setRestS] = useState(() => str(initialConfig?.rest_s));

  function pickKind(next: GroupKind) {
    setKind(next);
    // Seed sensible numbers the first time a timed kind is picked.
    const d = defaultGroupConfig(next);
    if (d) {
      setCapMin(toMin(d.time_cap_s));
      setRounds(str(d.rounds));
      setIntervalS(str(d.interval_s));
      setWorkS(str(d.work_s));
      setRestS(str(d.rest_s));
    }
  }

  function submit() {
    setError(null);
    const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
    const config: GroupConfig = {};
    if (kind === "amrap" || kind === "for_time") {
      const cap = num(capMin);
      if (cap != null) config.time_cap_s = Math.round(cap * 60);
    }
    if (kind === "emom" || kind === "for_time" || kind === "tabata") config.rounds = num(rounds);
    if (kind === "emom") config.interval_s = num(intervalS);
    if (kind === "tabata") {
      config.work_s = num(workS);
      config.rest_s = num(restS);
    }
    const clean = Object.fromEntries(Object.entries(config).filter(([, v]) => v != null && !Number.isNaN(v)));
    startTransition(async () => {
      const result = await onConfirm(kind, isTimedKind(kind) ? (clean as GroupConfig) : null);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  const field = (id: string, label: string, value: string, set: (v: string) => void, step?: string) => (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" inputMode="decimal" min={0} step={step} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  const items = GROUP_KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="group_kind">{t("kind")}</Label>
            <Select value={kind} onValueChange={(v) => v && pickKind(v as GroupKind)} items={items}>
              <SelectTrigger id="group_kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {items.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`hints.${kind}`)}</p>
          </div>

          {(kind === "amrap" || kind === "for_time") &&
            field("group_cap", kind === "amrap" ? t("timeCapMin") : t("timeCapMinOptional"), capMin, setCapMin, "0.5")}
          {(kind === "emom" || kind === "for_time" || kind === "tabata") &&
            field("group_rounds", t("rounds"), rounds, setRounds, "1")}
          {kind === "emom" && field("group_interval", t("intervalSec"), intervalS, setIntervalS, "5")}
          {kind === "tabata" && (
            <div className="grid grid-cols-2 gap-4">
              {field("group_work", t("workSec"), workS, setWorkS, "5")}
              {field("group_rest", t("restSec"), restS, setRestS, "5")}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{tErrors(error)}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {tCommon("cancel")}
          </Button>
          <Button type="button" disabled={pending} onClick={submit} className="min-w-24">
            {pending ? tCommon("pending") : tCommon("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function str(v: number | undefined) {
  return v == null ? "" : String(v);
}
function toMin(s: number | undefined) {
  return s == null ? "" : String(Math.round((s / 60) * 100) / 100);
}
