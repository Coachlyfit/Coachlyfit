import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  VOICE_NOTE_BITRATE,
  VOICE_NOTE_MAX_BYTES,
  VOICE_NOTE_MAX_SECONDS,
  VOICE_NOTE_MIN_SECONDS,
  normalizeVoiceMime,
} from "@/domain/messages/voice-notes";
import type { VoiceRecording } from "@/lib/messages/group-messages";

export type VoiceRecorderNotice = "permissionDenied" | "tooShort" | "tooLarge" | "limitReached";
type RecorderState = "idle" | "requesting" | "recording" | "preview";

// Opus in WebM everywhere it exists; AAC in MP4 is what Safari records.
const RECORDER_MIME_TYPES = ["audio/webm;codecs=opus", "audio/mp4"];
// Chunks arrive once a second, so stop a little short of the cap: a browser
// that ignores the requested bitrate (Safari's AAC) still ends up under it.
const STOP_AT_BYTES = VOICE_NOTE_MAX_BYTES - 32_000;
const TICK_MS = 250;

function pickRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

const subscribeNever = () => () => {};

/** Records one voice note at a time: start -> (stop | limit) -> preview ->
 * reset. The microphone is held only while recording, and is released on
 * stop, cancel and unmount alike. */
export function useVoiceRecorder(onNotice: (notice: VoiceRecorderNotice) => void) {
  // False on the server and during hydration, so the mic button never
  // renders somewhere it can't work.
  const supported = useSyncExternalStore(
    subscribeNever,
    () => pickRecorderMime() !== null,
    () => false,
  );
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [recording, setRecording] = useState<VoiceRecording | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  // Bumped by cancel/unmount: whatever an older session still delivers
  // (a late permission grant, the recorder's final chunk) is dropped.
  const sessionRef = useRef(0);
  const onNoticeRef = useRef(onNotice);
  useEffect(() => {
    onNoticeRef.current = onNotice;
  }, [onNotice]);

  const release = useCallback(() => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }, []);

  const cancel = useCallback(() => {
    sessionRef.current += 1;
    stop();
    release();
    setRecording(null);
    setState("idle");
  }, [release, stop]);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      release();
    },
    [release],
  );

  const start = useCallback(async () => {
    const recorderMime = pickRecorderMime();
    const mime = recorderMime && normalizeVoiceMime(recorderMime);
    if (!recorderMime || !mime) return;

    const session = ++sessionRef.current;
    setRecording(null);
    setElapsedSec(0);
    setState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      if (session === sessionRef.current) {
        setState("idle");
        onNoticeRef.current("permissionDenied");
      }
      return;
    }
    if (session !== sessionRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    const recorder = new MediaRecorder(stream, { mimeType: recorderMime, audioBitsPerSecond: VOICE_NOTE_BITRATE });
    const chunks: Blob[] = [];
    let bytes = 0;
    const startedAt = performance.now();
    streamRef.current = stream;
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      chunks.push(event.data);
      bytes += event.data.size;
      if (bytes >= STOP_AT_BYTES && recorder.state === "recording") {
        recorder.stop();
        if (session === sessionRef.current) onNoticeRef.current("limitReached");
      }
    };

    recorder.onstop = () => {
      const elapsedMs = performance.now() - startedAt;
      if (session !== sessionRef.current) return;
      release();

      const blob = new Blob(chunks, { type: mime });
      const rejected: VoiceRecorderNotice | null =
        elapsedMs < VOICE_NOTE_MIN_SECONDS * 1000 ? "tooShort" : blob.size > VOICE_NOTE_MAX_BYTES ? "tooLarge" : null;
      if (rejected) {
        setState("idle");
        onNoticeRef.current(rejected);
        return;
      }
      setRecording({ blob, mime, durationSec: Math.min(VOICE_NOTE_MAX_SECONDS, Math.round(elapsedMs / 1000)) });
      setState("preview");
    };

    timerRef.current = setInterval(() => {
      const seconds = (performance.now() - startedAt) / 1000;
      setElapsedSec(Math.min(VOICE_NOTE_MAX_SECONDS, Math.floor(seconds)));
      if (seconds >= VOICE_NOTE_MAX_SECONDS && recorder.state === "recording") {
        recorder.stop();
        onNoticeRef.current("limitReached");
      }
    }, TICK_MS);

    recorder.start(1000);
    setState("recording");
  }, [release]);

  return { supported, state, elapsedSec, recording, start, stop, cancel };
}
