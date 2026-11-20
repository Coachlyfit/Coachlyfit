"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/domain/coaching-applications/schema";
import { acceptApplicationAction, updateApplicationAction } from "../actions";

export function TriageForm({ id, locale, status: initial, notes: initialNotes }: { id: string; locale: string; status: ApplicationStatus; notes: string }) {
  const t = useTranslations("applications");
  const router = useRouter();
  const [status, setStatus] = useState<ApplicationStatus>(initial);
  const [notes, setNotes] = useState(initialNotes);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fail = (code: string): void => {
    toast.error(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.failed"));
  };

  function save(next: ApplicationStatus) {
    startTransition(async () => {
      const res = await updateApplicationAction(locale, id, { status: next, coachNotes: notes });
      if (res && "error" in res) return fail(res.error);
      setStatus(next);
      toast.success(t("saved"));
      router.refresh();
    });
  }

  function accept(sendWelcome: boolean) {
    startTransition(async () => {
      const res = await acceptApplicationAction(locale, id, sendWelcome, notes);
      if ("error" in res) return fail(res.error);
      setStatus("accepted");
      setJoinUrl(res.joinUrl);
      toast.success(
        !sendWelcome ? t("accept.doneManual") : res.linked ? t("accept.doneLinked") : res.emailed ? t("accept.doneEmailed") : t("accept.doneNoEmail"),
      );
      router.refresh();
    });
  }

  const statusItems = APPLICATION_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }));

  return (
    <Card className="gap-4 p-5">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">{t("triage.status")}</label>
        <Select value={status} onValueChange={(v) => v && setStatus(v as ApplicationStatus)} items={statusItems}>
          <SelectTrigger className="w-full sm:w-60" aria-label={t("triage.status")}>
            <SelectValue>{(v: string) => t(`status.${v as ApplicationStatus}`)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {statusItems.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="coach-notes" className="text-sm font-medium">
          {t("triage.notes")}
        </label>
        <Textarea id="coach-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} placeholder={t("triage.notesHint")} />
        <p className="text-sm text-muted-foreground">{t("triage.notesPrivate")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => save(status)}>
          {t("triage.save")}
        </Button>
        {status !== "accepted" && (
          <>
            <Button variant="secondary" disabled={pending} onClick={() => accept(true)}>
              {t("accept.withEmail")}
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => accept(false)}>
              {t("accept.manual")}
            </Button>
          </>
        )}
        {status !== "rejected" && (
          <Button variant="outline" disabled={pending} onClick={() => save("rejected")}>
            {t("reject.button")}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{t("reject.note")}</p>

      {joinUrl && (
        <div className="rounded-md border p-3 text-sm">
          <p className="mb-1 font-medium">{t("accept.linkLabel")}</p>
          <p dir="ltr" className="break-all text-start">
            {joinUrl}
          </p>
        </div>
      )}
    </Card>
  );
}
