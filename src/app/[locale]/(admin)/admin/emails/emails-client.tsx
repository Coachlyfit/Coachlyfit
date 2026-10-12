"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/domain/locale";
import { selectRecipients } from "@/domain/emails/recipients";
import { sendCampaignAction, sendTestEmailAction } from "./actions";
import { EmailPreview } from "./email-preview";
import { RecipientPicker, type CoachOption } from "./recipient-picker";
import { campaignSchema, type CampaignInput } from "./schemas";

/** Composer on one side, live preview on the other (stacked below `lg`). The
 * recipient count shown here is a convenience: the send action resolves the
 * recipients again on the server and reports the real numbers. */
export function EmailsClient({
  locale,
  coaches,
  appUrl,
}: {
  locale: AppLocale;
  coaches: CoachOption[];
  appUrl: string;
}) {
  const t = useTranslations("admin.emails");
  const tErrors = useTranslations("admin.emails.errors");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, startSend] = useTransition();
  const [testing, startTest] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    getValues,
    trigger,
    formState: { errors },
  } = useForm<CampaignInput>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      subject: "",
      body: "",
      // Arabic-first: a new email starts RTL whatever the admin's UI locale.
      direction: "rtl",
      filter: "all",
      coachIds: [],
    },
  });

  const [subject, body, direction, filter, coachIds] = useWatch({
    control,
    name: ["subject", "body", "direction", "filter", "coachIds"],
  });
  const recipientCount = selectRecipients(coaches, filter, coachIds).length;

  function showError(code: string) {
    toast.error(tErrors.has(code) ? tErrors(code) : tErrors("send_failed"));
  }

  function sendTest() {
    startTest(async () => {
      if (!(await trigger(["subject", "body"]))) return;
      const { subject, body, direction } = getValues();
      const result = await sendTestEmailAction(locale, { subject, body, direction });
      if ("error" in result) showError(result.error);
      else toast.success(t("testSent", { email: result.email }));
    });
  }

  function send() {
    startSend(async () => {
      const result = await sendCampaignAction(locale, getValues());
      setConfirmOpen(false);
      if ("error" in result) {
        showError(result.error);
        return;
      }
      if (result.failed > 0) toast.warning(t("sentWithFailures", { sent: result.sent, failed: result.failed }));
      else toast.success(t("sent", { count: result.sent }));
      reset();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("compose.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(() => setConfirmOpen(true))} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-2">
              <Label>{t("recipients.label")}</Label>
              <Segmented
                value={filter}
                onChange={(value) => setValue("filter", value, { shouldValidate: true })}
                label={t("recipients.label")}
                options={[
                  { value: "all", label: t("recipients.all") },
                  { value: "active", label: t("recipients.active") },
                  { value: "selected", label: t("recipients.selected") },
                ]}
              />
              {filter === "selected" && (
                <RecipientPicker
                  coaches={coaches}
                  value={coachIds}
                  onChange={(ids) => setValue("coachIds", ids, { shouldValidate: true })}
                />
              )}
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {t("recipients.count", { count: recipientCount })}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email-subject">{t("subject.label")}</Label>
              <Input id="email-subject" dir={direction} maxLength={200} aria-invalid={!!errors.subject} {...register("subject")} />
              {errors.subject && <p className="text-xs text-destructive">{t("subject.required")}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="email-body">{t("body.label")}</Label>
              <Textarea
                id="email-body"
                dir={direction}
                rows={12}
                maxLength={20000}
                aria-invalid={!!errors.body}
                aria-describedby="email-body-hint"
                {...register("body")}
              />
              {errors.body && <p className="text-xs text-destructive">{t("body.required")}</p>}
              <p id="email-body-hint" className="text-xs text-muted-foreground">
                {t("body.hint", { variable: "{{coach_name}}" })}
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>{t("direction.label")}</Label>
              <Segmented
                value={direction}
                onChange={(value) => setValue("direction", value)}
                label={t("direction.label")}
                options={[
                  { value: "rtl", label: t("direction.rtl") },
                  { value: "ltr", label: t("direction.ltr") },
                ]}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={sending || recipientCount === 0} className="min-w-24">
                {t("send")}
              </Button>
              <Button type="button" variant="outline" disabled={testing} onClick={sendTest}>
                {testing ? t("testSending") : t("sendTest")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("preview.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmailPreview subject={subject} body={body} direction={direction} appUrl={appUrl} />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirm.title", { count: recipientCount })}
        description={t("confirm.body")}
        confirmLabel={t("confirm.action")}
        onConfirm={send}
        pending={sending}
        variant="default"
      />
    </div>
  );
}
