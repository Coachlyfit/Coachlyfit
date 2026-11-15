"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useRouter } from "@/i18n/navigation";
import { deleteClientAction } from "./actions";

/** Confirm + soft-delete a client. Controlled so both the roster row menu
 * and the client page header can open it from a menu item. On success the
 * coach lands on the clients list (the deleted client's own page would 404). */
export function DeleteClientDialog({
  locale,
  clientId,
  clientName,
  open,
  onOpenChange,
}: {
  locale: string;
  clientId: string;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("clients.delete");
  const tErrors = useTranslations("clients.errors");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const result = await deleteClientAction(locale, clientId);
      if (result?.error) throw new Error(result.error);
    },
    onSuccess: async () => {
      toast.success(t("success", { name: clientName }));
      onOpenChange(false);
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      router.replace("/clients");
      router.refresh();
    },
    onError: (error: Error) => {
      // Known action errors are translated; anything else (network, thrown
      // server error) falls back to the generic message.
      toast.error(tErrors.has(error.message) ? tErrors(error.message) : t("failed"));
    },
  });

  return (
    <AlertDialog
      open={open}
      // Don't let Escape / backdrop dismiss it mid-request.
      onOpenChange={(next) => !mutation.isPending && onOpenChange(next)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title", { name: clientName })}</AlertDialogTitle>
          <AlertDialogDescription>{t("description")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>{tCommon("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="min-w-24"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? t("deleting") : t("confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
