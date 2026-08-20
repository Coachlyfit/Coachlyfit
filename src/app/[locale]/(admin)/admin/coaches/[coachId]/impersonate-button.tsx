"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { impersonateCoachAction } from "../../actions";

/** Full navigation (not router.push) on success — the returned URL is
 * /auth/confirm, a route that sets real session cookies, not an in-app
 * page. See admin/actions.ts's impersonateCoachAction for why this only
 * ever reaches that URL after begin_impersonation() has already verified
 * and logged the request in Postgres. */
export function ImpersonateButton({ locale, coachId }: { locale: string; coachId: string }) {
  const t = useTranslations("admin.impersonation");
  const tErrors = useTranslations("admin.impersonation.errors");
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await impersonateCoachAction(locale, coachId);
      if ("error" in result) {
        setError(tErrors.has(result.error) ? tErrors(result.error) : tErrors("unknown"));
        return;
      }
      window.location.href = result.url;
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <UserCog className="size-4" aria-hidden="true" />
        {t("action")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle")}
        description={error ?? t("confirmBody")}
        confirmLabel={t("action")}
        onConfirm={onConfirm}
        pending={pending}
      />
    </>
  );
}
