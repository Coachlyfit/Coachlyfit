"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const SHOW_DELAY_MS = 100;
const MIN_VISIBLE_MS = 300;

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  const [state, setState] = useState<"idle" | "loading">("idle");
  const previousKey = useRef(routeKey);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A click handler on any in-app link starts the "pending" clock; the
  // effect below closes it out once the route key actually changes.
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = (event.target as HTMLElement)?.closest("a[href]");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href || href.startsWith("http") || href.startsWith("#")) return;

      if (showTimer.current) clearTimeout(showTimer.current);
      showTimer.current = setTimeout(() => {
        setState("loading");
      }, SHOW_DELAY_MS);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  useEffect(() => {
    if (previousKey.current === routeKey) return;
    previousKey.current = routeKey;

    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }

    setState("loading");

    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setState("idle");
    }, MIN_VISIBLE_MS);

    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [routeKey]);

  return (
    <div
      role="progressbar"
      aria-hidden="true"
      aria-label="Page loading"
      data-state={state}
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] bg-primary transition-opacity duration-200 data-[state=idle]:opacity-0 data-[state=loading]:opacity-100 data-[state=loading]:animate-[navigation-progress_1.2s_ease-in-out_infinite] motion-reduce:data-[state=loading]:animate-none"
    />
  );
}
