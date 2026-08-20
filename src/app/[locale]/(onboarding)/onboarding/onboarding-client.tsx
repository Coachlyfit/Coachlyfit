"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApertureSweep } from "@/components/brand/aperture-sweep";
import { parseRoster, guessFields, type ImportField } from "@/domain/clients/import";
import {
  saveTrainingModeAction,
  importClientsAction,
  createStarterTemplateAction,
  completeOnboardingAction,
} from "./actions";

type TrainingMode = "online" | "hybrid" | "in_person";
type TemplateKey = "intake" | "checkin" | "diet";
type CreatedClient = { clientId: string; token: string; displayName: string; phone?: string };

const FIELD_KEYS: ImportField[] = ["name", "phone", "goal", "fee", "skip"];

export function OnboardingClient({ locale, steps }: { locale: "ar" | "en"; steps: string[] }) {
  const t = useTranslations("onboarding");
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [trainingMode, setTrainingMode] = useState<TrainingMode>("online");
  const [paste, setPaste] = useState("");
  const [fields, setFields] = useState<ImportField[]>([]);
  const [created, setCreated] = useState<CreatedClient[]>([]);
  const [templateKey, setTemplateKey] = useState<TemplateKey>("checkin");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => parseRoster(paste), [paste]);
  const activeFields = fields.length === rows[0]?.length ? fields : guessFields(rows);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

  function next() {
    setError(null);
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }
  function back() {
    setError(null);
    setStep((s) => Math.max(0, s - 1));
  }

  function submitTrainingMode() {
    const formData = new FormData();
    formData.set("trainingMode", trainingMode);
    startTransition(async () => {
      const result = await saveTrainingModeAction(locale, formData);
      if (result?.error) setError(result.error);
      else next();
    });
  }

  function submitImport() {
    startTransition(async () => {
      const result = await importClientsAction(locale, rows, activeFields);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setCreated(
        result.created.map((c, i) => {
          const phoneIdx = activeFields.indexOf("phone");
          return { ...c, phone: phoneIdx >= 0 ? rows[i]?.[phoneIdx] : undefined };
        })
      );
      setSelected(Object.fromEntries(result.created.map((c) => [c.clientId, true])));
      setStep(3); // -> template step
    });
  }

  function submitTemplate() {
    const formData = new FormData();
    formData.set("templateKey", templateKey);
    startTransition(async () => {
      const result = await createStarterTemplateAction(locale, formData);
      if (result?.error) setError(result.error);
      else next();
    });
  }

  function finish() {
    startTransition(async () => {
      const result = await completeOnboardingAction(locale);
      if (result?.error) setError(result.error);
    });
  }

  const selectedClients = created.filter((c) => selected[c.clientId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
          {t("kicker", { step: step + 1, total: steps.length })}
        </span>
        <Progress value={((step + 1) / steps.length) * 100} />
      </div>

      {step === 0 && (
        <StepCard title={t("trainingMode.title")} description={t("trainingMode.subtitle")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["online", "hybrid", "in_person"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTrainingMode(mode)}
                className={`flex flex-col gap-2 rounded-xl border-1.5 p-4 text-start ${
                  trainingMode === mode ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <span className="text-sm font-semibold">{t(`trainingMode.options.${mode}.title`)}</span>
                <span className="text-xs text-muted-foreground">{t(`trainingMode.options.${mode}.body`)}</span>
              </button>
            ))}
          </div>
          <StepActions onNext={submitTrainingMode} pending={pending} showBack={false} />
        </StepCard>
      )}

      {step === 1 && (
        <StepCard title={t("import.title")} description={t("import.subtitle")}>
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            dir="rtl"
            rows={10}
            className="font-mono text-xs"
            placeholder={t("import.placeholder")}
          />
          <p className="font-mono text-xs text-muted-foreground">
            {rows.length > 0 ? t("import.parsed", { rows: rows.length, cols: rows[0]?.length ?? 0 }) : t("import.empty")}
          </p>
          <StepActions onBack={back} onNext={() => setStep(2)} nextDisabled={rows.length === 0} pending={pending} />
        </StepCard>
      )}

      {step === 2 && (
        <StepCard title={t("mapping.title")} description={t("mapping.subtitle")}>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-start text-xs">
              <thead className="bg-muted">
                <tr>
                  {(rows[0] ?? []).map((_, col) => (
                    <th key={col} className="p-2">
                      <Select
                        value={activeFields[col]}
                        onValueChange={(value) => {
                          const next = [...activeFields];
                          next[col] = value as ImportField;
                          setFields(next);
                        }}
                      >
                        <SelectTrigger size="sm" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FIELD_KEYS.map((f) => (
                            <SelectItem key={f} value={f}>
                              {t(`mapping.fields.${f}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, r) => (
                  <tr key={r} className="border-t border-border">
                    {row.map((cell, c) => (
                      <td key={c} className="truncate p-2">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <StepActions onBack={() => setStep(1)} onNext={submitImport} pending={pending} nextLabel={t("mapping.submit", { count: rows.length })} />
        </StepCard>
      )}

      {step === 3 && (
        <StepCard title={t("template.title")} description={t("template.subtitle")}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(["intake", "checkin", "diet"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setTemplateKey(key)}
                className={`flex flex-col gap-2 rounded-xl border-1.5 p-4 text-start ${
                  templateKey === key ? "border-primary bg-primary/5" : "border-border"
                }`}
              >
                <span className="text-sm font-semibold">{t(`template.options.${key}`)}</span>
              </button>
            ))}
          </div>
          <StepActions onBack={() => setStep(2)} onNext={submitTemplate} pending={pending} />
        </StepCard>
      )}

      {step === 4 && (
        <StepCard title={t("send.title")} description={t("send.subtitle")}>
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {created.map((c) => (
              <label key={c.clientId} className="flex items-center gap-3 p-3 text-sm">
                <Checkbox
                  checked={!!selected[c.clientId]}
                  onCheckedChange={(checked) =>
                    setSelected((s) => ({ ...s, [c.clientId]: checked === true }))
                  }
                />
                <span className="flex-1">{c.displayName}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.phone ?? "—"}</span>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <a
                      href={`https://wa.me/${c.phone ? `2${c.phone.replace(/\D/g, "")}` : ""}?text=${encodeURIComponent(
                        t("send.messageBody", { joinUrl: `${appUrl}/${locale}/join/${c.token}` })
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  {t("send.whatsapp")}
                </Button>
              </label>
            ))}
          </div>
          <StepActions
            onBack={() => setStep(3)}
            onNext={next}
            pending={pending}
            nextLabel={t("send.submit", { count: selectedClients.length })}
          />
        </StepCard>
      )}

      {step === 5 && (
        <StepCard title={t("done.title")} description={t("done.subtitle")}>
          <div className="flex flex-col items-center gap-4 py-6">
            <ApertureSweep size={72} />
            <div className="grid w-full grid-cols-2 gap-3">
              <SummaryStat label={t("done.clients")} value={created.length} />
              <SummaryStat label={t("done.sent")} value={selectedClients.length} />
            </div>
          </div>
          <Button onClick={finish} disabled={pending} className="w-full">
            {t("done.cta")}
          </Button>
        </StepCard>
      )}

      {error && (
        <p role="alert" className="text-center text-sm text-destructive">
          {t(`errors.${error}`)}
        </p>
      )}
    </div>
  );
}

function StepCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}

function StepActions({
  onBack,
  onNext,
  pending,
  showBack = true,
  nextDisabled = false,
  nextLabel,
}: {
  onBack?: () => void;
  onNext: () => void;
  pending: boolean;
  showBack?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  const t = useTranslations("common");
  return (
    <div className="flex gap-3">
      <Button onClick={onNext} disabled={pending || nextDisabled}>
        {nextLabel ?? t("next")}
      </Button>
      {showBack && onBack && (
        <Button variant="outline" onClick={onBack} disabled={pending}>
          {t("back")}
        </Button>
      )}
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3 text-center">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
