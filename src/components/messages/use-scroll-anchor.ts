import { useCallback, useEffect, useRef, useState } from "react";

const BOTTOM_THRESHOLD_PX = 80;

/** Tracks whether the user is reading history vs. sitting at the live edge
 * of the conversation. New items only auto-scroll when they were already at
 * the bottom (or it's their own outgoing message) — otherwise a "new
 * messages" counter accumulates for a pill the caller renders. */
export function useScrollAnchor(containerRef: React.RefObject<HTMLDivElement | null>, itemCount: number) {
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const prevCountRef = useRef(itemCount);
  const forceScrollRef = useRef(false);

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

  // Call before an own-message send so the resulting item count change
  // force-scrolls regardless of current scroll position.
  const notifyOwnMessage = useCallback(() => {
    forceScrollRef.current = true;
  }, []);

  useEffect(() => {
    if (itemCount === prevCountRef.current) return;
    const grew = itemCount > prevCountRef.current;
    prevCountRef.current = itemCount;

    if (!grew) return;

    if (isAtBottom || forceScrollRef.current) {
      const behavior: ScrollBehavior = forceScrollRef.current ? "auto" : "smooth";
      forceScrollRef.current = false;
      // Wait a frame so the new content has been laid out before measuring scrollHeight.
      requestAnimationFrame(() => scrollToBottom(behavior));
    } else {
      setNewMessageCount((n) => n + 1);
    }
  }, [itemCount, isAtBottom, scrollToBottom]);

  return { isAtBottom, newMessageCount, scrollToBottom, onScroll, notifyOwnMessage };
}
