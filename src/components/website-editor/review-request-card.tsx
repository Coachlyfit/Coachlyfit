"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ResultCard } from "@/domain/sites/results.service";
import { createReviewRequestAction } from "@/app/[locale]/(coach)/website/actions";
import { Field, selectClass } from "./form-kit";
import type { ClientOption } from "./create-card-dialog";

const COPIED_MS = 1800;

/** Creates a personal, single-use review link for one client, to copy or send
 * on WhatsApp. The link is shown once: the server keeps only its hash. */
export function ReviewRequestCard({ clients, cards }: { clients: ClientOption[]; cards: ResultCard[] }) {
  const t = useTranslations("websiteEditor.reviews.request");
  const tErr = useTranslations("websiteEditor.errors");
  const uid = useId();
  const [clientId, setClientId] = useState("");
  const [cardId, setCardId] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clientName = clients.find((c) => c.id === clientId)?.name ?? "";
  // Only cards the client hasn't withdrawn can ride along on the link.
  const clientCards = cards.filter((c) => c.clientId === clientId && c.consent.status !== "withdrawn");

  function reset(id: string) {
    setClientId(id);
    setCardId("");
    setUrl(null);
    setError(null);
  }

  function create() {
    setError(null);
    startTransition(async () => {
      const res = await createReviewRequestAction({ clientId, cardId: cardId || null });
      if ("error" in res) {
        setError(tErr.has(res.error as "generic") ? tErr(res.error as "generic") : tErr("generic"));
        return;
      }
      setUrl(res.url);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return toast.error(tErr("generic"));
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  const whatsappHref = url ? `https://wa.me/?text=${encodeURIComponent(t("whatsappText", { name: clientName.split(" ")[0] ?? "", url }))}` : null;

  return (
    <section aria-labelledby={`${uid}-title`} className="flex flex-col gap-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <h2 id={`${uid}-title`} className="text-base font-semibold">
        {t("title")}
      </h2>

      <Field id={`${uid}-client`} label={t("client")}>
        <select id={`${uid}-client`} className={selectClass} value={clientId} onChange={(e) => reset(e.target.value)}>
          <option value="">{t("pick")}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      {clientCards.length > 0 && (
        <Field id={`${uid}-card`} label={t("card")}>
          <select id={`${uid}-card`} className={selectClass} value={cardId} onChange={(e) => { setCardId(e.target.value); setUrl(null); }}>
            <option value="">{t("noCard")}</option>
            {clientCards.map((c) => (
              <option key={c.id} value={c.id}>
                {new Date(c.createdAt).toISOString().slice(0, 10)}
              </option>
            ))}
          </select>
        </Field>
      )}

      {!url && (
        <Button type="button" className="min-h-11 self-start" disabled={!clientId || pending} onClick={create}>
          {t("create")}
        </Button>
      )}

      {url && (
        <div className="flex flex-col gap-3">
          <Field id={`${uid}-link`} label={t("link")}>
            <Input id={`${uid}-link`} readOnly value={url} dir="ltr" className="font-mono text-sm" onFocus={(e) => e.currentTarget.select()} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={copy}>
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              <span aria-live="polite">{copied ? t("copied") : t("copy")}</span>
            </Button>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-[10px] px-4 text-sm font-medium ring-1 ring-foreground/20 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                {t("whatsapp")}
              </a>
            )}
          </div>
        </div>
      )}

      <p className="text-sm text-muted-foreground">{t("hint")}</p>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
