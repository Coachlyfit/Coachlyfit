"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { BroadcastAudience } from "@/domain/messages/messages.service";
import { sendBroadcastAction } from "@/domain/messages/messages-actions";

const AUDIENCES: BroadcastAudience[] = ["all", "subscribed"];

/** One message, inserted separately into each recipient's own thread — not
 * a group chat. `counts` is a preview from page load; the action resolves
 * the real recipient list again when it sends. */
export function BroadcastDialog({
  counts,
  trigger,
}: {
  counts: Record<BroadcastAudience, number>;
  trigger: React.ReactElement;
}) {
  const t = useTranslations("inbox.broadcast");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("inbox.errors");
  const bodyId = useId();
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<BroadcastAudience>("all");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const count = counts[audience];

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const result = await sendBroadcastAction(body, audience);
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      setBody("");
      setOpen(false);
      toast.success(t("success", { count }));
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("audienceLabel")}</span>
            <RadioGroup
              value={audience}
              onValueChange={(value) => setAudience(value as BroadcastAudience)}
              aria-label={t("audienceGroup")}
              className="flex flex-wrap gap-2"
            >
              {AUDIENCES.map((value) => (
                <Label
                  key={value}
                  className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3.5 has-data-checked:border-primary has-data-checked:bg-accent-tint"
                >
                  <RadioGroupItem value={value} />
                  {t(value)}
                  <span className="font-mono tabular-nums text-muted-foreground">{counts[value]}</span>
                </Label>
              ))}
            </RadioGroup>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor={bodyId}>{t("messageLabel")}</Label>
            <Textarea
              id={bodyId}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("placeholder")}
              rows={4}
              maxLength={2000}
              className="text-base lg:text-sm"
            />
          </div>

          <p className="text-sm text-muted-foreground">{t("note")}</p>
          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {tErrors(formError)}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={pending || count === 0 || !body.trim()} className="min-w-32">
              {pending ? tCommon("pending") : t("submit", { count })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
