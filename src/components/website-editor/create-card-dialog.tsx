"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/domain/locale";
import type { ClientPhoto } from "@/domain/sites/results.service";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createCardAction, loadClientPhotosAction } from "@/app/[locale]/(coach)/website/actions";
import { Field, selectClass } from "./form-kit";

export type ClientOption = { id: string; name: string };

const DAY_MS = 24 * 60 * 60 * 1000;

function PhotoPicker({
  legend,
  photos,
  value,
  onChange,
  name,
}: {
  legend: string;
  photos: ClientPhoto[];
  value: string | null;
  onChange: (id: string) => void;
  name: string;
}) {
  const t = useTranslations("websiteEditor.results.dialog");
  const locale = useLocale() as AppLocale;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <label
            key={p.id}
            className={cn(
              "relative size-20 cursor-pointer overflow-hidden rounded-lg bg-muted ring-1 ring-foreground/15 has-[:checked]:ring-3 has-[:checked]:ring-primary has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring"
            )}
          >
            <input type="radio" name={name} className="sr-only" checked={value === p.id} onChange={() => onChange(p.id)} />
            {p.url && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img
                src={p.url}
                alt={t("photoAlt", { date: formatDate(p.createdAt, locale, { dateStyle: "medium" }) })}
                className="size-full object-cover"
                loading="lazy"
              />
            )}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Pick a client, then their Before and After photos; creating the card also
 * sends the client a consent request. */
export function CreateCardDialog({
  open,
  onOpenChange,
  clients,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: ClientOption[];
}) {
  const t = useTranslations("websiteEditor.results.dialog");
  const tErr = useTranslations("websiteEditor.errors");
  const uid = useId();
  const [clientId, setClientId] = useState("");
  const [photos, setPhotos] = useState<ClientPhoto[] | null>(null);
  const [before, setBefore] = useState<string | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [days, setDays] = useState("");
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  // Load the chosen client's photos; ignore a response that arrives after the
  // coach already picked someone else.
  useEffect(() => {
    if (!clientId) return;
    let stale = false;
    loadClientPhotosAction(clientId).then((res) => {
      if (stale) return;
      if ("error" in res) setError(tErr(res.error as "load_failed"));
      else setPhotos(res.photos);
    });
    return () => {
      stale = true;
    };
  }, [clientId, tErr]);

  function pickClient(id: string) {
    setClientId(id);
    setPhotos(null);
    setBefore(null);
    setAfter(null);
    setDays("");
    setError(null);
  }

  // Suggest the span between the two photos; the coach can still change it.
  function suggest(b: string | null, a: string | null) {
    const pb = photos?.find((p) => p.id === b);
    const pa = photos?.find((p) => p.id === a);
    if (pb && pa) setDays(String(Math.max(1, Math.round((Date.parse(pa.createdAt) - Date.parse(pb.createdAt)) / DAY_MS))));
  }

  function submit() {
    setError(null);
    const durationDays = Number(days);
    const weightDelta = weight.trim() === "" ? null : Number(weight);
    if (!clientId || !before || !after || before === after || !Number.isInteger(durationDays) || durationDays < 1) {
      setError(tErr("invalid_input"));
      return;
    }
    if (weightDelta !== null && Number.isNaN(weightDelta)) {
      setError(tErr("invalid_input"));
      return;
    }
    startSave(async () => {
      const res = await createCardAction({ clientId, beforeMediaId: before, afterMediaId: after, durationDays, weightDelta });
      if (res?.error) {
        setError(tErr.has(res.error as "generic") ? tErr(res.error as "generic") : tErr("generic"));
        return;
      }
      toast.success(t("created"));
      pickClient("");
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <Field id={`${uid}-client`} label={t("client")}>
          <select id={`${uid}-client`} className={selectClass} value={clientId} onChange={(e) => pickClient(e.target.value)}>
            <option value="">{t("pickClient")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        {clientId && photos === null && !error && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
        {photos?.length === 0 && <p className="text-sm text-muted-foreground">{t("noPhotos")}</p>}

        {photos && photos.length > 0 && (
          <>
            <p className="text-sm text-muted-foreground">{t("pickTwo")}</p>
            <PhotoPicker
              legend={t("beforePhoto")}
              name={`${uid}-before`}
              photos={photos}
              value={before}
              onChange={(id) => {
                setBefore(id);
                suggest(id, after);
              }}
            />
            <PhotoPicker
              legend={t("afterPhoto")}
              name={`${uid}-after`}
              photos={photos}
              value={after}
              onChange={(id) => {
                setAfter(id);
                suggest(before, id);
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field id={`${uid}-days`} label={t("duration")}>
                <Input id={`${uid}-days`} type="number" inputMode="numeric" min={1} dir="ltr" className="font-mono" value={days} onChange={(e) => setDays(e.target.value)} />
              </Field>
              <Field id={`${uid}-kg`} label={t("weight")} hint={t("weightHint")}>
                <Input
                  id={`${uid}-kg`}
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  dir="ltr"
                  className="font-mono"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                  aria-describedby={`${uid}-kg-hint`}
                />
              </Field>
            </div>
          </>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)}>
            {t("cancel")}
          </Button>
          <Button type="button" className="min-h-11" disabled={saving || !before || !after || !days} onClick={submit}>
            {t("submit")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
