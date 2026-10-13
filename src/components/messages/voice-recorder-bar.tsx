import { useTranslations } from "next-intl";
import { Send, Square, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VoiceRecording } from "@/lib/messages/group-messages";
import { VoicePlayer, formatClock } from "./voice-player";

/** Takes the composer's input row while a voice note is being recorded, then
 * while it waits to be sent: nothing leaves the device until the sender has
 * had the chance to listen to it. */
export function VoiceRecorderBar({
  recording,
  elapsedSec,
  onStop,
  onCancel,
  onSend,
}: {
  /** Null while still recording; the finished note once stopped. */
  recording: VoiceRecording | null;
  elapsedSec: number;
  onStop: () => void;
  onCancel: () => void;
  onSend: () => void;
}) {
  const t = useTranslations("inbox.voice");

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 rounded-xl"
        onClick={onCancel}
        aria-label={t("cancel")}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
      <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-xl border border-border bg-card px-3.5">
        {recording ? (
          <div className="min-w-0 flex-1">
            <VoicePlayer
              voice={{ messageId: null, durationSec: recording.durationSec, expired: false, localBlob: recording.blob }}
            />
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm">
            <span className="size-2.5 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
            <span role="timer" className="font-mono tabular-nums">
              {formatClock(elapsedSec)}
            </span>
            <span className="text-muted-foreground">{t("recording")}</span>
          </p>
        )}
      </div>
      {recording ? (
        <Button size="icon" className="size-11 shrink-0 rounded-xl" onClick={onSend} aria-label={t("send")}>
          <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
        </Button>
      ) : (
        <Button size="icon" className="size-11 shrink-0 rounded-xl" onClick={onStop} aria-label={t("stop")}>
          <Square className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
