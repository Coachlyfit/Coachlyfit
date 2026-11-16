"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The private .ics subscription URL for a user's calendar app, a fallback for
 * people who don't connect Google. The token in it is the credential: anyone
 * with the URL can read the schedule, so it can be replaced here. */
export function FeedCard({
  baseUrl,
  token: initialToken,
  rotate,
}: {
  /** Origin the feed is served from, e.g. https://app.example.com */
  baseUrl: string;
  token: string;
  rotate: () => Promise<{ error: string } | { token: string }>;
}) {
  const t = useTranslations("appointments.feed");
  const [token, setToken] = useState(initialToken);
  const [pending, startTransition] = useTransition();
  const url = `${baseUrl}/api/calendar/${token}.ics`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t("copied"));
    } catch {
      toast.error(t("copyFailed"));
    }
  }

  function regenerate() {
    startTransition(async () => {
      const result = await rotate();
      if ("error" in result) {
        toast.error(t("failed"));
        return;
      }
      setToken(result.token);
      toast.success(t("regenerated"));
    });
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("title")}</h3>
      <p className="text-sm text-muted-foreground">{t("description")}</p>
      <div className="flex items-center gap-2">
        <Input readOnly dir="ltr" value={url} onFocus={(event) => event.currentTarget.select()} aria-label={t("title")} />
        <Button type="button" variant="outline" size="icon" aria-label={t("copy")} onClick={copy}>
          <Copy className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" aria-label={t("regenerate")} disabled={pending} onClick={regenerate}>
          <RefreshCw className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("warning")}</p>
    </section>
  );
}
