"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, Eye, EyeOff, KeyRound, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import type { ClientAccountState } from "@/domain/clients/client-account";
import { activateClientAction, setClientPasswordAction } from "../account-actions";

/** "activate": the client can't log in yet (no account, or unconfirmed).
 * "password": set a new password on a working account. */
export type ClientAccountMode = "activate" | "password";

export function ClientAccountDialog({
  locale,
  clientId,
  clientEmail,
  account,
  mode,
  open,
  onOpenChange,
}: {
  locale: string;
  clientId: string;
  clientEmail: string | null;
  account: ClientAccountState;
  mode: ClientAccountMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("clients.profile.accountDialog");
  const tErrors = useTranslations("clients.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(clientEmail ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  // Only a brand-new login needs an email; an unconfirmed signup already has
  // one, and its own password stays unless the coach types a new one.
  const needsEmail = mode === "activate" && account === "none";
  const passwordOptional = mode === "activate" && account === "unconfirmed";

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setPassword("");
      setShowPassword(false);
      setFormError(null);
      setDone(false);
      setCopied(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const formData = new FormData();
    if (password) formData.set("password", password);
    if (needsEmail && email) formData.set("email", email);
    startTransition(async () => {
      const result =
        mode === "activate"
          ? await activateClientAction(locale, clientId, formData)
          : await setClientPasswordAction(locale, clientId, formData);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  async function copyCredentials() {
    await navigator.clipboard.writeText(`${t("emailLabel")}: ${email}\n${t("passwordLabel")}: ${password}`);
    setCopied(true);
  }

  const Icon = mode === "activate" ? UserCheck : KeyRound;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4" aria-hidden="true" />
            {t(`${mode}.title`)}
          </DialogTitle>
          <DialogDescription>
            {done ? t("success") : mode === "activate" ? t(`activate.body.${account}`) : t("password.body")}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="flex flex-col gap-3">
            {password && (
              <>
                <div dir="ltr" className="rounded-md border border-border bg-muted/40 p-3 text-start font-mono text-sm">
                  {email && <p className="break-all">{email}</p>}
                  <p className="break-all">{password}</p>
                </div>
                <p className="text-sm text-muted-foreground">{t("shareHint")}</p>
                <Button type="button" variant="outline" onClick={copyCredentials}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? t("copied") : t("copy")}
                </Button>
              </>
            )}
            <Button type="button" onClick={() => close(false)}>
              {t("close")}
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            {needsEmail && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="account-email">{t("emailLabel")}</Label>
                <Input
                  id="account-email"
                  type="email"
                  dir="ltr"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-2">
              <Label htmlFor="account-password">
                {passwordOptional ? t("passwordOptional") : t("passwordLabel")}
              </Label>
              <div className="relative">
                <Input
                  id="account-password"
                  type={showPassword ? "text" : "password"}
                  dir="ltr"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t("hide") : t("show")}
                  className="absolute inset-y-0 end-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
            </div>
            {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
            <Button type="submit" disabled={pending} className="min-w-24">
              {pending ? tCommon("pending") : t(`${mode}.submit`)}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
