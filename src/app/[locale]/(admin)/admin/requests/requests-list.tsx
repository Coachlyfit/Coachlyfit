"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { resolveSubscriptionRequestAction } from "../actions";

export type AdminRequestRow = {
  id: string;
  coachId: string;
  /** Omitted on the coach's own page, where the name is the page heading. */
  coachName?: string;
  type: string;
  tierName: string | null;
  note: string | null;
  status: string;
  adminResponse: string | null;
  createdAt: string;
};

const STATUS_VARIANT = { pending: "warning", approved: "success", rejected: "destructive" } as const;

/** Coach update requests, pending first (the caller sorts). Approving a plan
 * change applies it in admin_resolve_subscription_request(); the reply is
 * shown to the coach. */
export function RequestsList({ locale, requests }: { locale: AppLocale; requests: AdminRequestRow[] }) {
  const t = useTranslations("admin.requests");
  const tErrors = useTranslations("admin.coaches.errors");
  const tCommon = useTranslations("common");
  const [target, setTarget] = useState<{ request: AdminRequestRow; approve: boolean } | null>(null);
  const [response, setResponse] = useState("");
  const [pending, startTransition] = useTransition();

  function resolve() {
    if (!target) return;
    startTransition(async () => {
      const result = await resolveSubscriptionRequestAction(locale, {
        requestId: target.request.id,
        approve: target.approve,
        response,
      });
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("update_failed"));
        return;
      }
      toast.success(t(target.approve ? "approved" : "rejected"));
      setTarget(null);
      setResponse("");
    });
  }

  if (requests.length === 0) return <p className="py-4 text-center text-muted-foreground">{t("empty")}</p>;

  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {requests.map((request) => (
          <li key={request.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              {request.coachName && (
                <Link href={`/admin/coaches/${request.coachId}`} className="font-semibold hover:underline">
                  {request.coachName}
                </Link>
              )}
              <span>
                {t.has(`types.${request.type}`) ? t(`types.${request.type}`) : request.type}
                {request.tierName && ` · ${request.tierName}`}
              </span>
              <Badge variant={STATUS_VARIANT[request.status as keyof typeof STATUS_VARIANT] ?? "secondary"}>
                {t.has(`status.${request.status}`) ? t(`status.${request.status}`) : request.status}
              </Badge>
              <span className="ms-auto text-xs tabular-nums text-muted-foreground">
                {formatDate(request.createdAt, locale)}
              </span>
            </div>
            {request.note && <p className="whitespace-pre-wrap text-muted-foreground">{request.note}</p>}
            {request.adminResponse && (
              <p className="whitespace-pre-wrap">
                <span className="font-medium">{t("response")}: </span>
                {request.adminResponse}
              </p>
            )}
            {request.status === "pending" && (
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => setTarget({ request, approve: true })}>
                  {t("approve")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setTarget({ request, approve: false })}>
                  {t("reject")}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t(target?.approve ? "approveTitle" : "rejectTitle")}</DialogTitle>
            <DialogDescription>
              {target?.approve && target.request.type === "change_plan"
                ? t("approvePlanBody", { plan: target.request.tierName ?? "" })
                : t(target?.approve ? "approveBody" : "rejectBody")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="request-response">{t("responseLabel")}</Label>
            <Textarea
              id="request-response"
              rows={3}
              maxLength={1000}
              value={response}
              onChange={(event) => setResponse(event.target.value)}
            />
          </div>
          <Button
            type="button"
            variant={target?.approve ? "default" : "destructive"}
            className="min-w-24"
            disabled={pending}
            onClick={resolve}
          >
            {pending ? tCommon("pending") : t(target?.approve ? "approve" : "reject")}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
