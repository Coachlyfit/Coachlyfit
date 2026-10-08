import { useCallback, useLayoutEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 80;

/** Tracks whether the user is reading history vs. sitting at the live edge
 * of the conversation. A new message at the end only auto-scrolls when they
 * were already at the bottom (or it's their own outgoing message) —
 * otherwise a "new messages" counter accumulates for a pill the caller
 * renders. Older messages loaded at the top never move what's on screen.
 *
 * Takes the first/last message keys rather than a count: a count can't tell
 * "one arrived at the end" from "a page of history was prepended". */
export function useScrollAnchor(
  containerRef: React.RefObject<HTMLDivElement | null>,
  firstKey: string | null,
  lastKey: string | null,
) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const prevLastKeyRef = useRef<string | null>(null);
  const forceScrollRef = useRef(false);
  const prependSnapshotRef = useRef<{ scrollHeight: number; scrollTop: number } | null>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setNewMessageCount(0);
  }, [containerRef]);

  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom <= BOTTOM_THRESHOLD_PX;
    setIsAtBottom(atBottom);
    if (atBottom) setNewMessageCount(0);
  }, [containerRef]);

  // Call before an own-message send so the resulting new last message
  // force-scrolls regardless of current scroll position.
  const notifyOwnMessage = useCallback(() => {
    forceScrollRef.current = true;
  }, []);

  // Call right before requesting an older page, while the DOM still has the
  // pre-prepend height.
  const captureBeforePrepend = useCallback(() => {
    const el = containerRef.current;
    if (el) prependSnapshotRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop };
  }, [containerRef]);

  // Layout effects (not effects): both corrections must land before paint,
  // or the list visibly jumps for a frame.
  useLayoutEffect(() => {
    const el = containerRef.current;
    const snapshot = prependSnapshotRef.current;
    if (!el || !snapshot) return;
    prependSnapshotRef.current = null;
    el.scrollTop = snapshot.scrollTop + (el.scrollHeight - snapshot.scrollHeight);
  }, [containerRef, firstKey]);

  useLayoutEffect(() => {
    const previous = prevLastKeyRef.current;
    if (lastKey === previous) return;
    prevLastKeyRef.current = lastKey;
    if (lastKey === null) return;

    const el = containerRef.current;
    if (!el) return;
    if (previous === null || forceScrollRef.current) {
      // First load, or the reader's own message: land on it immediately.
      forceScrollRef.current = false;
      el.scrollTop = el.scrollHeight;
    } else if (isAtBottom) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- counts an external event (a message arriving while scrolled up); there is no render-time value to derive it from
      setNewMessageCount((n) => n + 1);
    }
  }, [containerRef, lastKey, isAtBottom]);

  return { isAtBottom, newMessageCount, scrollToBottom, onScroll, notifyOwnMessage, captureBeforePrepend };
}
