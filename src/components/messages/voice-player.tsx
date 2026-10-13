import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, MicOff, Pause, Play } from "lucide-react";
import { getVoiceNoteUrlAction } from "@/domain/messages/messages-actions";
import type { RenderableVoice } from "@/lib/messages/group-messages";
import { cn } from "@/lib/utils";

// Only one voice note plays at a time, across every bubble on the page.
let nowPlaying: HTMLAudioElement | null = null;

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoicePlayer({ voice, onDark }: { voice: RenderableVoice; onDark?: boolean }) {
  const t = useTranslations("inbox.voice");
  const audioRef = useRef<HTMLAudioElement>(null);
  const retriedRef = useRef(false);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);

  const localUrl = useMemo(() => (voice.localBlob ? URL.createObjectURL(voice.localBlob) : null), [voice.localBlob]);
  useEffect(() => () => void (localUrl && URL.revokeObjectURL(localUrl)), [localUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      if (nowPlaying === audio) nowPlaying = null;
    };
  }, []);

  if (voice.expired) {
    return (
      <p className="flex items-center gap-1.5 text-sm italic opacity-70">
        <MicOff className="size-4 shrink-0" aria-hidden="true" />
        {t("expired")}
      </p>
    );
  }

  async function play() {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.getAttribute("src")) {
      if (!voice.messageId) return;
      setStatus("loading");
      const result = await getVoiceNoteUrlAction(voice.messageId).catch(() => null);
      if (!result || "error" in result) {
        setStatus("error");
        return;
      }
      audio.src = result.url;
    }
    if (nowPlaying && nowPlaying !== audio) nowPlaying.pause();
    nowPlaying = audio;
    audio.play().catch(() => setStatus("error"));
  }

  function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void play();
    else audio.pause();
  }

  // A signed URL is short-lived: one that lapsed while the thread sat open
  // fails here, so sign a fresh one once before calling it an error.
  function handleError() {
    const audio = audioRef.current;
    if (!audio || localUrl || retriedRef.current) {
      setStatus("error");
      return;
    }
    retriedRef.current = true;
    audio.removeAttribute("src");
    setReady(false);
    void play();
  }

  const playing = status === "playing";
  const Icon = status === "loading" ? Loader2 : status === "error" ? AlertCircle : playing ? Pause : Play;

  return (
    <div className="flex min-w-48 flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          disabled={status === "loading"}
          aria-label={playing ? t("pause") : t("play")}
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none",
            onDark
              ? "bg-sidebar-foreground/15 hover:bg-sidebar-foreground/25 focus-visible:ring-sidebar-ring"
              : "bg-foreground/10 hover:bg-foreground/15 focus-visible:ring-ring",
          )}
        >
          <Icon
            className={cn("size-5", status === "loading" && "animate-spin", status === "error" && "text-destructive")}
            aria-hidden="true"
          />
        </button>
        {/* A native range follows the text direction by itself: in Arabic it
            fills from the right and the arrow keys swap, with no extra code. */}
        <input
          type="range"
          min={0}
          max={voice.durationSec}
          step={0.1}
          value={Math.min(position, voice.durationSec)}
          disabled={!ready}
          onChange={(e) => {
            const next = Number(e.target.value);
            setPosition(next);
            if (audioRef.current) audioRef.current.currentTime = next;
          }}
          aria-label={t("seek")}
          aria-valuetext={`${formatClock(position)} / ${formatClock(voice.durationSec)}`}
          className="h-6 min-w-0 flex-1 accent-current"
        />
        {/* The stored length, not the element's: a browser-recorded WebM
            carries no duration, so the element reports Infinity. */}
        <span className="font-mono text-[11px] tabular-nums opacity-70">
          {formatClock(playing || position > 0 ? position : voice.durationSec)}
        </span>
      </div>
      {status === "error" && (
        <p role="alert" className="text-xs">
          {t("loadFailed")}
        </p>
      )}
      <audio
        ref={audioRef}
        src={localUrl ?? undefined}
        preload="none"
        className="hidden"
        onLoadedMetadata={() => setReady(true)}
        onPlay={() => setStatus("playing")}
        onPause={() => setStatus((s) => (s === "playing" ? "idle" : s))}
        onEnded={() => {
          setStatus("idle");
          setPosition(0);
        }}
        onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
        onError={handleError}
      />
    </div>
  );
}
