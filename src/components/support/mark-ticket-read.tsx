"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { markTicketReadAction } from "@/domain/support/support-actions";
import { SUPPORT_UNREAD_KEY } from "./support-unread-badge";

/** Mounted on a ticket page that has something unread: opening the ticket is
 * what reads it. Then the nav badge is refreshed. */
export function MarkTicketRead({ ticketId }: { ticketId: string }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    markTicketReadAction(ticketId).then(() => queryClient.invalidateQueries({ queryKey: SUPPORT_UNREAD_KEY }));
  }, [ticketId, queryClient]);

  return null;
}
