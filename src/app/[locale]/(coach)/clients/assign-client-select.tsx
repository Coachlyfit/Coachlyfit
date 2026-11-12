"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import { assignClientsAction } from "./actions";
import type { AppLocale } from "@/domain/locale";

export type TeamMember = {
  id: string;
  name: string;
  isOwner: boolean;
};

const UNASSIGNED = "__unassigned__";

export function AssignClientSelect({
  locale,
  clientId,
  assignedTo,
  team,
}: {
  locale: AppLocale;
  clientId: string;
  assignedTo: string | null;
  team: TeamMember[];
}) {
  const t = useTranslations("clients");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const members = team.filter((m) => !m.isOwner);

  function handleChange(value: string | null) {
    const assigneeId = !value || value === UNASSIGNED ? null : value;
    startTransition(async () => {
      const result = await assignClientsAction(locale, [clientId], assigneeId);
      if (result?.error) {
        const key =
          result.error === "owner_only"
            ? "assign.errorOwnerOnly"
            : result.error === "invalid_assignee"
              ? "assign.errorInvalidAssignee"
              : "assign.errorFailed";
        toast.error(t(key));
        return;
      }
      router.refresh();
    });
  }

  return (
    <Select
      value={assignedTo ?? UNASSIGNED}
      onValueChange={handleChange}
      disabled={pending}
      items={[
        { value: UNASSIGNED, label: t("assign.unassigned") },
        ...members.map((m) => ({ value: m.id, label: m.name })),
      ]}
    >
      <SelectTrigger aria-label={t("assign.label")} className="h-8 w-auto min-w-32 text-sm">
        <SelectValue>
          {(v: string) => {
            if (v === UNASSIGNED) return t("assign.unassigned");
            return members.find((m) => m.id === v)?.name ?? t("assign.unassigned");
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={UNASSIGNED}>{t("assign.unassigned")}</SelectItem>
        {members.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
