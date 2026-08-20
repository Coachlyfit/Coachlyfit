"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { regenerateInviteAction } from "./actions";

export function RegenerateInviteButton({ locale, clientId }: { locale: string; clientId: string }) {
  const t = useTranslations("clients");
  const tDialog = useTranslations("clients.dialog");
  const [pending, startTransition] = useTransition();
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function onClick() {
    startTransition(async () => {
      const result = await regenerateInviteAction(locale, clientId);
      if (!("error" in result)) setJoinUrl(result.joinUrl);
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onClick} disabled={pending}>
        <LinkIcon className="size-4" />
        {t("regenerate")}
      </Button>
      <Dialog open={!!joinUrl} onOpenChange={(next) => !next && setJoinUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tDialog("linkTitle")}</DialogTitle>
            <DialogDescription>{tDialog("linkBody")}</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2">
            <Input readOnly value={joinUrl ?? ""} className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => {
                if (joinUrl) navigator.clipboard.writeText(joinUrl);
                setCopied(true);
              }}
              aria-label={tDialog("copy")}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
