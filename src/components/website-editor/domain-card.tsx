"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DomainStatus } from "@/domain/sites/vercel-domains";
import { cn } from "@/lib/utils";
import {
  checkDomainAction,
  removeDomainAction,
  setDomainAction,
  type DomainResult,
} from "@/app/[locale]/(coach)/website/actions";
import { describedBy, Field } from "./form-kit";

export type DomainState = "none" | DomainStatus["state"];

/** Connect, check and remove the coach's custom domain. Until it's connected
 * the site is still reachable at the white-label address (`fallbackUrl`). */
export function DomainCard({
  domain: initialDomain,
  state: initialState,
  fallbackUrl,
}: {
  domain: string | null;
  state: DomainState;
  fallbackUrl: string;
}) {
  const t = useTranslations("websiteEditor.domain");
  const tErr = useTranslations("websiteEditor.errors");
  const uid = useId();
  const [domain, setDomain] = useState(initialDomain);
  const [state, setState] = useState<DomainState>(initialState);
  const [records, setRecords] = useState<DomainStatus["records"]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function apply(res: DomainResult) {
    if ("error" in res) {
      setError(tErr.has(res.error as "generic") ? tErr(res.error as "generic") : tErr("generic"));
      return;
    }
    setError(null);
    setDomain(res.domain);
    setState(res.state);
    setRecords(res.records);
  }

  const connect = () =>
    startTransition(async () => {
      const res = await setDomainAction(input);
      apply(res);
      if (!("error" in res)) {
        setInput("");
        toast.success(t("saved"));
      }
    });

  const check = () => startTransition(async () => apply(await checkDomainAction()));

  const remove = () =>
    startTransition(async () => {
      const res = await removeDomainAction();
      if (res?.error) return apply(res);
      setDomain(null);
      setState("none");
      setRecords([]);
      toast.success(t("removed"));
    });

  const inputId = `${uid}-domain`;

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${uid}-title`} className="text-base font-semibold">
          {t("title")}
        </h2>
        {state !== "none" && (
          <span
            className={cn(
              "rounded-md px-2.5 py-0.5 text-sm font-medium",
              state === "connected" && "bg-success-tint text-success-tint-foreground",
              state === "pending" && "bg-warning-tint text-warning-tint-foreground",
              state === "error" && "bg-destructive/10 text-destructive"
            )}
          >
            {t(state)}
          </span>
        )}
      </div>

      {domain ? (
        <div className="flex flex-col gap-1">
          <bdi dir="ltr" className="font-mono text-base font-medium">
            {domain}
          </bdi>
          {state === "connected" && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="size-3.5" aria-hidden="true" />
              {t("ssl")}
            </p>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("none")}</p>
      )}

      {domain && state !== "connected" && (
        <>
          {records.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t("records")}</p>
              <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-start text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-start font-medium">{t("recordType")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("recordName")}</th>
                      <th className="px-3 py-2 text-start font-medium">{t("recordValue")}</th>
                    </tr>
                  </thead>
                  <tbody dir="ltr" className="font-mono">
                    {records.map((r) => (
                      <tr key={`${r.type}-${r.name}`} className="border-t border-foreground/10">
                        <td className="px-3 py-2">{r.type}</td>
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2 [overflow-wrap:anywhere]">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <p className="text-sm text-muted-foreground">{t("dnsDelay")}</p>
          <p className="text-sm text-muted-foreground">
            {t.rich("fallback", {
              url: fallbackUrl,
              link: (chunks) => (
                <bdi dir="ltr" className="font-mono">
                  {chunks}
                </bdi>
              ),
            })}
          </p>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        {domain && (
          <>
            <Button type="button" variant="outline" className="min-h-11" disabled={pending} onClick={check}>
              {t("check")}
            </Button>
            <Button type="button" variant="ghost" className="min-h-11 text-destructive" disabled={pending} onClick={remove}>
              {t("remove")}
            </Button>
          </>
        )}
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) connect();
        }}
        noValidate
      >
        <Field id={inputId} label={domain ? t("change") : t("label")} hint={t("hint")} error={error ?? undefined}>
          <Input
            id={inputId}
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            className="font-mono"
            placeholder={t("placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={describedBy(inputId, true, !!error)}
          />
        </Field>
        <Button type="submit" className="min-h-11 self-start" disabled={pending || !input.trim()}>
          {t("connect")}
        </Button>
      </form>
    </section>
  );
}
