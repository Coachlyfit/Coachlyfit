import type { AppLocale } from "@/domain/locale";
import type { ThreadItem } from "@/lib/messages/group-messages";
import { MessageBubble } from "./message-bubble";

export function MessageGroup({
  group,
  locale,
  onRetry,
  viewerAvatarUrl,
  otherAvatarUrl,
}: {
  group: Extract<ThreadItem, { kind: "message-group" }>;
  locale: AppLocale;
  onRetry: (tempId: string) => void;
  viewerAvatarUrl: string | null;
  otherAvatarUrl: string | null;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {group.messages.map((message) => (
        <MessageBubble
          key={message.key}
          message={{ ...message, senderAvatarUrl: message.senderAvatarUrl ?? (message.isOwn ? viewerAvatarUrl : otherAvatarUrl) }}
          locale={locale}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
