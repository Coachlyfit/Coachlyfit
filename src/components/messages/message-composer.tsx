import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Mic, Send, Smile } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmojiPicker } from "frimousse";
import type { VoiceRecording } from "@/lib/messages/group-messages";
import type { AppLocale } from "@/domain/locale";
import { useVoiceRecorder } from "./use-voice-recorder";
import { VoiceRecorderBar } from "./voice-recorder-bar";

const MAX_TEXTAREA_HEIGHT_PX = 144; // ~6 lines

export function MessageComposer({
  locale,
  quickReplies,
  onSend,
  onSendVoice,
  onTyping,
  onStopTyping,
}: {
  /** Interface direction of the current locale, used to set `dir` on the
   * emoji picker so its rows flip correctly between RTL and LTR. */
  locale: AppLocale;
  /** Canned texts shown as chips above the input; picking one fills the
   * draft (it is never sent without the sender seeing it first). */
  quickReplies?: string[];
  onSend: (body: string) => void;
  onSendVoice: (recording: VoiceRecording) => void;
  onTyping: () => void;
  onStopTyping: () => void;
}) {
  const t = useTranslations("inbox");
  const [draft, setDraft] = useState("");
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder((notice) => {
    if (notice === "limitReached") toast.message(t("voice.limitReached"));
    else toast.error(notice === "tooLarge" ? t("errors.too_large") : t(`voice.${notice}`));
  });

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

  /** Insert `emoji` at the textarea cursor (or append if there's no focusable
   * field), then restore the caret right after the inserted emoji. */
  const insertEmoji = useCallback(
    (emoji: string) => {
      setEmojiPickerOpen(false);
      const el = textareaRef.current;
      const start = el?.selectionStart ?? 0;
      const end = el?.selectionEnd ?? 0;
      const next = draft.slice(0, start) + emoji + draft.slice(end);
      setDraft(next);
      // React re-renders the controlled textarea with `next`; restore the
      // caret after the commit so the user can keep typing where they left.
      requestAnimationFrame(() => {
        const current = textareaRef.current;
        if (current) {
          current.focus();
          current.setSelectionRange(start + emoji.length, start + emoji.length);
        }
      });
      onTyping();
      if (el) resize(el);
    },
    [draft, onTyping],
  );

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

  function handleSendVoice() {
    if (!recorder.recording) return;
    onSendVoice(recorder.recording);
    recorder.cancel();
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
      {recorder.state !== "idle" ? (
        <VoiceRecorderBar
          recording={recorder.recording}
          elapsedSec={recorder.elapsedSec}
          onStop={recorder.stop}
          onCancel={recorder.cancel}
          onSend={handleSendVoice}
        />
      ) : (
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
        <Popover open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
          <PopoverTrigger
            render={
              // Ghost icon button: muted by default, brand tint on hover.
              <Button
                size="icon"
                variant="ghost"
                className="size-11 shrink-0 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary"
                aria-label={t("emoji")}
              >
                <Smile className="size-4" aria-hidden="true" />
              </Button>
            }
          />
          <PopoverContent className="w-80 p-0 rounded-lg border border-border bg-card shadow-sm outline-none">
            <EmojiPicker.Root
              dir={locale}
              locale="en"
              columns={8}
              onEmojiSelect={({ emoji }) => insertEmoji(emoji)}
            >
              <EmojiPicker.Search
                className="w-full min-w-[14rem] rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-ring"
                placeholder={t("emojiSearch")}
              />
              <EmojiPicker.Viewport
                className="max-h-[16rem] overflow-y-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted/50 [&::-webkit-scrollbar-thumb:hover]:bg-muted"
              >
                <EmojiPicker.Loading>{t("emojiLoading")}</EmojiPicker.Loading>
                <EmojiPicker.Empty>{t("emojiEmpty")}</EmojiPicker.Empty>
                <EmojiPicker.List
                  className="p-0.5"
                  components={{
                    CategoryHeader: ({ category, ...props }) => (
                      <div
                        {...props}
                        className="px-2 py-1 text-xs font-medium text-muted-foreground text-start"
                      >
                        {category.label}
                      </div>
                    ),
                    Emoji: ({ emoji, ...props }) => (
                      <button
                        {...props}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-xl leading-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {emoji.emoji}
                      </button>
                    ),
                    Row: ({ className, ...props }) => (
                      <div {...props} className={cn("flex w-full justify-between", className)} />
                    ),
                  }}
                />
              </EmojiPicker.Viewport>
            </EmojiPicker.Root>
          </PopoverContent>
        </Popover>
        {/* An empty draft has nothing to send, so that slot offers the mic. */}
        {!draft.trim() && recorder.supported ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-11 shrink-0 rounded-xl text-muted-foreground hover:bg-primary/10 hover:text-primary"
            onClick={recorder.start}
            aria-label={t("voice.record")}
          >
            <Mic className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button
            size="icon"
            className="size-11 shrink-0 rounded-xl"
            disabled={!draft.trim()}
            onClick={handleSend}
            aria-label={t("send")}
          >
            <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          </Button>
        )}
      </div>
      )}
    </div>
  );
}
