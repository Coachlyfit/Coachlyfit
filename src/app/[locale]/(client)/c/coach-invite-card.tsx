"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { respondToCoachInviteAction } from "./relationship-actions";

export type CoachInvite = { id: string; businessName: string | null };

/** Accept/decline an invite from another coach (a coaching_relationships row
 * in 'pending'). Accepting switches coaches in one transaction server-side;
 * revalidatePath then re-renders /c under the new coach. */
export function CoachInviteCard({ locale, invite }: { locale: string; invite: CoachInvite }) {
  const t = useTranslations("relationships");
  const [shareHistory, setShareHistory] = useState(false);
  const [pending, startTransition] = useTransition();
  const coach = invite.businessName ?? t("unknownCoach");

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = await respondToCoachInviteAction(locale, {
        relationshipId: invite.id,
        accept,
        shareHistory,
      });
      if (result?.error) toast.error(t(`errors.${result.error}`));
      else toast.success(accept ? t("accepted", { coach }) : t("declined"));
    });
  }

  return (
    <Card className="border-accent-tint bg-accent-tint text-accent-tint-foreground">
      <CardContent className="flex flex-col gap-3 pt-6">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent-tint-foreground/70">
            {t("inviteTitle")}
          </p>
          <p className="mt-1 text-sm font-semibold">{t("inviteBody", { coach })}</p>
          <p className="mt-1 text-xs text-accent-tint-foreground/80">{t("switchNote")}</p>
        </div>

        <label className="flex items-start gap-3 text-start">
          <Switch checked={shareHistory} onCheckedChange={setShareHistory} disabled={pending} className="mt-0.5" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t("shareHistory")}</span>
            <span className="block text-xs text-accent-tint-foreground/80">{t("shareHistoryHint")}</span>
          </span>
        </label>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={pending} onClick={() => respond(true)}>
            {t("accept")}
          </Button>
          <Button variant="outline" className="flex-1" disabled={pending} onClick={() => respond(false)}>
            {t("decline")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
