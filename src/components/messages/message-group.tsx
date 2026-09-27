import type { AppLocale } from "@/domain/locale";
import type { ThreadItem } from "@/lib/messages/group-messages";
import { MessageBubble } from "./message-bubble";

export function MessageGroup({
  group,
  locale,
  onRetry,
}: {
  group: Extract<ThreadItem, { kind: "message-group" }>;
  locale: AppLocale;
  onRetry: (tempId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {group.messages.map((message, index) => (
        <MessageBubble
          key={message.key}
          message={message}
          locale={locale}
          showMeta={index === group.messages.length - 1}
          onRetry={onRetry}
        />
      ))}
    </div>
  );
}
