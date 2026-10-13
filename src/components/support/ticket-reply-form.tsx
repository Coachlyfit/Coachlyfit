"use client";

import { useState, useTransition } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BODY_MAX, attachmentFolder } from "@/domain/support/support";
import { replyTicketAction } from "@/app/[locale]/(coach)/support/actions";
import { adminReplyAction } from "@/app/[locale]/(admin)/admin/support/actions";
import { AttachmentPicker, type PickedAttachment } from "./attachment-picker";
import { SUPPORT_UNREAD_KEY } from "./support-unread-badge";

/** The composer under a ticket's thread, for either side. The admin's also
 * has the internal-note switch; a note carries no images (the database
 * refuses them), so the picker goes away while it is on.
 *
 * `coachId` is the ticket owner's: attachments from both sides live in the
 * owner's folder, which is what lets the coach read the admin's. */
export function TicketReplyForm({
  locale,
  ticketId,
  coachId,
  side,
}: {
  locale: string;
  ticketId: string;
  coachId: string;
  side: "coach" | "admin";
}) {
  const t = useTranslations("support.thread");
  const tAdmin = useTranslations("admin.support");
  const tErrors = useTranslations("support.errors");
  const queryClient = useQueryClient();
  const [pending, startTransition] = useTransition();
  // The message's id is fixed before it is sent: its files are uploaded
  // under it. A new one is drawn after each successful send.
  const [messageId, setMessageId] = useState(() => crypto.randomUUID());
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PickedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [internal, setInternal] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input = {
      ticketId,
      id: messageId,
      body,
      attachmentPaths: internal ? [] : attachments.map((item) => item.path),
    };
    startTransition(async () => {
      const result =
        side === "admin"
          ? await adminReplyAction(locale, { ...input, internal })
          : await replyTicketAction(locale, input);
      if (result?.error) {
        toast.error(tErrors.has(result.error) ? tErrors(result.error) : tErrors("send_failed"));
        return;
      }
      toast.success(internal ? tAdmin("noteAdded") : t("sent"));
      setBody("");
      setAttachments([]);
      setMessageId(crypto.randomUUID());
      queryClient.invalidateQueries({ queryKey: SUPPORT_UNREAD_KEY });
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={internal ? tAdmin("notePlaceholder") : t("replyPlaceholder")}
        aria-label={internal ? tAdmin("notePlaceholder") : t("replyPlaceholder")}
        rows={4}
        maxLength={BODY_MAX}
        dir="auto"
      />
      {!internal && (
        <AttachmentPicker
          folder={attachmentFolder(coachId, ticketId, messageId)}
          value={attachments}
          onChange={setAttachments}
          onUploadingChange={setUploading}
          disabled={pending}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {side === "admin" ? (
          <div className="flex items-center gap-2">
            <Switch id="ticket-internal" checked={internal} onCheckedChange={setInternal} disabled={pending} />
            <Label htmlFor="ticket-internal" className="text-sm font-normal">
              {tAdmin("internalToggle")}
            </Label>
          </div>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending || uploading || body.trim().length === 0} className="min-w-24">
          {internal ? tAdmin("addNote") : t("send")}
        </Button>
      </div>
    </form>
  );
}
