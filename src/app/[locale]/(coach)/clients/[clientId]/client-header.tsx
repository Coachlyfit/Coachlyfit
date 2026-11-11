"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { MoreVertical, MessageCircle, Pencil, Archive, ArchiveRestore, KeyRound, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format";
import type { AppLocale } from "@/domain/locale";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ObservationDialog } from "./observation-dialog";
import { EditClientDialog } from "./edit-client-dialog";
import { ClientAccountDialog, type ClientAccountMode } from "./client-account-dialog";
import type { ClientAccountState } from "@/domain/clients/client-account";
import { setClientArchivedAction } from "../actions";
import { RegenerateInviteButton } from "../regenerate-invite-button";

type Client = {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  status: "invited" | "active" | "archived";
  created_at: string;
};

export function ClientHeader({
  locale,
  coachId,
  client,
  account,
}: {
  locale: AppLocale;
  coachId: string;
  client: Client;
  account: ClientAccountState;
}) {
  const t = useTranslations("clients");
  const tProfile = useTranslations("clients.profile");
  const tErrors = useTranslations("clients.errors");
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [accountMode, setAccountMode] = useState<ClientAccountMode | null>(null);
  const [pending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const archived = client.status === "archived";

  function toggleArchive() {
    setActionError(null);
    startTransition(async () => {
      const result = await setClientArchivedAction(locale, client.id, !archived);
      if (result?.error) {
        setActionError(result.error);
        return;
      }
      setConfirmArchive(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {archived && (
        <Card className="border-muted-foreground/20 bg-muted/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="text-sm text-muted-foreground">{tProfile("archivedBanner")}</p>
            <Button variant="outline" size="sm" onClick={toggleArchive} disabled={pending} className="min-w-24">
              <ArchiveRestore className="size-4" />
              {pending ? t("regenerate") : tProfile("restore")}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserAvatar src={client.avatarUrl} name={client.display_name} userId={client.id} size="lg" />
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold tracking-tight">{client.display_name}</h1>
                <Badge variant={client.status === "active" ? "success" : "secondary"}>
                  {t(`status.${client.status}`)}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {client.email && (
                  <a href={`mailto:${client.email}`} dir="ltr" className="break-all hover:underline">
                    {client.email}
                  </a>
                )}
                {client.phone && (
                  <a href={`tel:${client.phone}`} dir="ltr" className="hover:underline">
                    {client.phone}
                  </a>
                )}
                <span className="tabular-nums">
                  {tProfile("joined", { date: formatDate(client.created_at, locale, { dateStyle: "medium" }) })}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!archived && (
              <Button nativeButton={false} render={<Link href={`/messages/${client.id}`} />} size="sm">
                <MessageCircle className="size-4" />
                {tProfile("message")}
              </Button>
            )}
            {!archived && <ObservationDialog locale={locale} clientId={client.id} coachId={coachId} />}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="icon-sm" />}>
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="size-4" />
                  {tProfile("edit")}
                </DropdownMenuItem>
                {!archived && account !== "ready" && (
                  <DropdownMenuItem onClick={() => setAccountMode("activate")}>
                    <UserCheck className="size-4" />
                    {tProfile("activateAccount")}
                  </DropdownMenuItem>
                )}
                {!archived && account !== "none" && (
                  <DropdownMenuItem onClick={() => setAccountMode("password")}>
                    <KeyRound className="size-4" />
                    {tProfile("setPassword")}
                  </DropdownMenuItem>
                )}
                {client.status === "invited" && (
                  <div className="px-1.5 py-1">
                    <RegenerateInviteButton locale={locale} clientId={client.id} />
                  </div>
                )}
                <DropdownMenuItem
                  variant={archived ? "default" : "destructive"}
                  onClick={() => (archived ? toggleArchive() : setConfirmArchive(true))}
                >
                  {archived ? <ArchiveRestore className="size-4" /> : <Archive className="size-4" />}
                  {archived ? tProfile("restore") : tProfile("archive")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>
        {actionError && (
          <CardContent className="pt-0">
            <p className="text-sm text-destructive">{tErrors(actionError)}</p>
          </CardContent>
        )}
      </Card>

      <EditClientDialog locale={locale} clientId={client.id} client={client} open={editOpen} onOpenChange={setEditOpen} />

      {accountMode && (
        <ClientAccountDialog
          key={accountMode}
          locale={locale}
          clientId={client.id}
          clientEmail={client.email}
          account={account}
          mode={accountMode}
          open
          onOpenChange={(open) => !open && setAccountMode(null)}
        />
      )}

      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title={tProfile("confirmArchiveTitle")}
        description={tProfile("confirmArchiveBody")}
        confirmLabel={tProfile("archive")}
        onConfirm={toggleArchive}
        pending={pending}
      />
    </div>
  );
}
