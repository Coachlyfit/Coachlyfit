"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { sendMessageAction } from "@/domain/messages/messages-actions";

const composeSchema = z.object({
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(2000),
});
type ComposeInput = z.infer<typeof composeSchema>;

export function NewMessageDialog({
  clients,
  trigger,
}: {
  clients: { id: string; display_name: string }[];
  trigger: React.ReactElement;
}) {
  const t = useTranslations("inbox.compose");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("inbox.errors");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    handleSubmit,
    control,
    register,
    reset,
    formState: { errors },
  } = useForm<ComposeInput>({ resolver: zodResolver(composeSchema), defaultValues: { clientId: "", body: "" } });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    startTransition(async () => {
      const result = await sendMessageAction(data.clientId, data.body, crypto.randomUUID());
      if (result?.error) {
        setFormError(result.error);
        return;
      }
      reset();
      setOpen(false);
      router.push(`/messages/${data.clientId}`);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="clientId">{t("client")}</Label>
            <Controller
              name="clientId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={clients.map((c) => ({ value: c.id, label: c.display_name }))}
                >
                  <SelectTrigger id="clientId">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.clientId && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Textarea aria-label={t("placeholder")} {...register("body")} placeholder={t("placeholder")} rows={4} autoFocus />
            {errors.body && <p className="text-sm text-destructive">{tErrors("invalid_input")}</p>}
          </div>
          {formError && <p className="text-sm text-destructive">{tErrors(formError)}</p>}
          <Button type="submit" disabled={pending} className="min-w-24">
            {pending ? tCommon("pending") : t("submit")}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
