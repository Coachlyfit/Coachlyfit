import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

type ViewerRole = "coach" | "client";

const STOP_TYPING_DEBOUNCE_MS = 2500;
const OTHER_TYPING_EXPIRE_MS = 5000;

/** Broadcasts real typing start/stop events over the shared presence
 * channel, and derives the other party's typing state from real incoming
 * events only. The expiry timer never *creates* the indicator — it only
 * clears a stale "start" if a "stop" was dropped (closed tab, lost socket),
 * so this stays honest real-time behavior, not a fake animation. */
export function useTyping(channel: RealtimeChannel | null, viewerRole: ViewerRole) {
  const [otherTyping, setOtherTyping] = useState(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expireTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    if (!channel) return;

    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      if (payload.role === viewerRole) return;
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);

      if (payload.state === "start") {
        setOtherTyping(true);
        expireTimerRef.current = setTimeout(() => setOtherTyping(false), OTHER_TYPING_EXPIRE_MS);
      } else {
        setOtherTyping(false);
      }
    });
  }, [channel, viewerRole]);

  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
      if (expireTimerRef.current) clearTimeout(expireTimerRef.current);
    };
  }, []);

  const notifyTyping = useCallback(() => {
    if (!channel) return;
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      channel.send({ type: "broadcast", event: "typing", payload: { role: viewerRole, state: "start" } });
    }
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => {
      isTypingRef.current = false;
      channel.send({ type: "broadcast", event: "typing", payload: { role: viewerRole, state: "stop" } });
    }, STOP_TYPING_DEBOUNCE_MS);
  }, [channel, viewerRole]);

  const notifyStopped = useCallback(() => {
    if (!channel) return;
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      channel.send({ type: "broadcast", event: "typing", payload: { role: viewerRole, state: "stop" } });
    }
  }, [channel, viewerRole]);

  return { otherTyping, notifyTyping, notifyStopped };
}
