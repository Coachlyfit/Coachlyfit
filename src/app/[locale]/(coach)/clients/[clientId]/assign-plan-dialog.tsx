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
import { Link, useRouter } from "@/i18n/navigation";
import { cloneProgramAction } from "../../programs/actions";
import { cloneDietPlanAction } from "../../diets/actions";

const assignSchema = z.object({ template_id: z.string().uuid() });
type AssignInput = z.infer<typeof assignSchema>;

/** One dialog for both plan kinds — assigning a program or a diet plan onto
 * this client is the identical flow (pick a template, clone it), just
 * against a different clone action. Used both for "Assign" on an empty
 * TrainingCard/NutritionCard (replaceActive false) and "Replace" on a
 * populated one (replaceActive true, which soft-archives the client's
 * other active plan of that kind — see ProgramsService/DietPlansService
 * cloneToClient). */
export function AssignPlanDialog({
  kind,
  locale,
  clientId,
  templates,
  replaceActive,
  trigger,
  variant = "default",
}: {
  kind: "program" | "diet";
  locale: string;
  clientId: string;
  templates: { id: string; name: string }[];
  replaceActive: boolean;
  trigger: string;
  variant?: "default" | "outline";
}) {
  const t = useTranslations("clients.profile.assignDialog");
  const tErrors = useTranslations(kind === "program" ? "programs.errors" : "diets.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AssignInput>({ resolver: zodResolver(assignSchema), defaultValues: { template_id: "" } });

  // No templates of this kind exist yet — send the coach to build one
  // instead of opening a dialog with an empty, useless select.
  if (templates.length === 0) {
    return (
      <Button
        type="button"
        variant={variant}
        size="sm"
        render={<Link href={kind === "program" ? "/programs" : "/diets"} />}
      >
        <Send className="size-4" />
        {trigger}
      </Button>
    );
  }

  const onSubmit = handleSubmit((data) => {
    setFormError(null);
    startTransition(async () => {
      const result =
        kind === "program"
          ? await cloneProgramAction(locale, data.template_id, clientId, replaceActive)
          : await cloneDietPlanAction(locale, data.template_id, clientId, replaceActive);
      if ("error" in result) {
        setFormError(result.error);
        return;
      }
      setOpen(false);
      router.push(kind === "program" ? `/programs/${result.id}` : `/diets/${result.id}`);
    });
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant={variant} size="sm" />}>
        <Send className="size-4" />
        {trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{trigger}</DialogTitle>
          <DialogDescription>{replaceActive ? t("replaceDescription") : t("assignDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="template_id">{t("template")}</Label>
            <Controller
              name="template_id"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  items={templates.map((tpl) => ({ value: tpl.id, label: tpl.name }))}
                >
                  <SelectTrigger id="template_id">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((tpl) => (
                      <SelectItem key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.template_id && <p className="text-sm text-destructive">{errors.template_id.message}</p>}
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
