import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_TEXTAREA_HEIGHT_PX = 144; // ~6 lines

export function MessageComposer({
  quickReplies,
  onSend,
  onTyping,
  onStopTyping,
}: {
  /** Canned texts shown as chips above the input; picking one fills the
   * draft (it is never sent without the sender seeing it first). */
  quickReplies?: string[];
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

  function handleQuickReply(text: string) {
    setDraft(text);
    onTyping();
    const el = textareaRef.current;
    if (!el) return;
    // The textarea still holds the old value until React commits, so size it
    // against the new one directly.
    el.value = text;
    resize(el);
    el.focus();
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
    <div className="flex flex-col gap-2">
      {quickReplies && quickReplies.length > 0 && (
        <div role="group" aria-label={t("quickReplies.label")} className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {quickReplies.map((text) => (
            <button
              key={text}
              type="button"
              onClick={() => handleQuickReply(text)}
              className="h-8 shrink-0 rounded-full border border-border bg-card px-3 text-[13px] transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {text}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={handleChange}
          onKeyDown={(e) => {
            // isComposing: Enter that confirms an IME candidate isn't a send.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={1}
          aria-label={t("placeholder")}
          placeholder={t("placeholder")}
          // text-base (16px) below lg: anything smaller makes iOS zoom the
          // page when the field takes focus.
          className="max-h-36 min-h-11 flex-1 resize-none rounded-xl border border-border bg-card px-3.5 py-2.5 text-base leading-relaxed outline-none focus-visible:ring-1 focus-visible:ring-ring lg:text-sm"
        />
        <Button
          size="icon"
          className="size-11 shrink-0 rounded-xl"
          disabled={!draft.trim()}
          onClick={handleSend}
          aria-label={t("send")}
        >
          <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
