import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_TEXTAREA_HEIGHT_PX = 144; // ~6 lines

export function MessageComposer({
  viewerRole,
  onSend,
  onTyping,
  onStopTyping,
}: {
  viewerRole: "coach" | "client";
  onSend: (body: string) => void;
  onTyping: () => void;
  onStopTyping: () => void;
}) {
  const t = useTranslations("inbox");
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setDraft(e.target.value);
    resize(e.target);
    if (e.target.value.trim()) onTyping();
    else onStopTyping();
  }

  function handleSend() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    onStopTyping();
    onSend(body);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
  }

  return (
    <div className={cn("flex items-end gap-2 pb-[env(safe-area-inset-bottom)]", viewerRole === "coach" && "me-14")}>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        rows={1}
        placeholder={t("placeholder")}
        className="max-h-36 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-card px-4 py-2.5 text-base leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm"
      />
      <Button
        size="icon"
        className="size-11 shrink-0 rounded-full"
        disabled={!draft.trim()}
        onClick={handleSend}
        aria-label={t("send")}
      >
        <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
      </Button>
    </div>
  );
}
