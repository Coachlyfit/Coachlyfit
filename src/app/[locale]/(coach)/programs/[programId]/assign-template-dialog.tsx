"use client";

import { useState, useTransition } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { z } from "zod";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useRouter } from "@/i18n/navigation";
import { cloneProgramAction } from "../actions";

const assignSchema = z.object({ client_id: z.string().uuid() });
type AssignInput = z.infer<typeof assignSchema>;

export function AssignTemplateDialog({
  locale,
  programId,
  clients,
  mode = "assign",
  trigger,
  children,
}: {
  locale: string;
  programId: string;
  clients: { id: string; display_name: string }[];
  /** Same clone either way; "duplicate" only swaps the copy, for a client
   * program being copied to another client rather than a template. */
  mode?: "assign" | "duplicate";
  /** Replaces the default outline button (the Programs list's cards). */
  trigger?: React.ReactElement;
  children?: React.ReactNode;
}) {
  const t = useTranslations(mode === "duplicate" ? "programs.duplicateDialog" : "programs.assignTemplateDialog");
  const tErrors = useTranslations("programs.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AssignInput>({ resolver: zodResolver(assignSchema), defaultValues: { client_id: "" } });

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    startTransition(async () => {
      const result = await cloneProgramAction(locale, programId, data.client_id);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/programs/${result.id}`);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button variant="outline" disabled={clients.length === 0} />}>
        {children ?? (
          <>
            <Send className="size-4" />
            {t("title")}
          </>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="client_id">{t("client")}</Label>
            <Controller
              name="client_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={clients.map((c) => ({ value: c.id, label: c.display_name }))}
                >
                  <SelectTrigger id="client_id">
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
            {errors.client_id && <p className="text-sm text-destructive">{errors.client_id.message}</p>}
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
