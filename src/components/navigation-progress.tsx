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
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        // Safety net: if this click never results in a route change (link
        // to current page, preventDefault'd handler, etc.), the route-key
        // effect below never fires to close the bar out. Force it closed.
        if (safetyTimer.current) clearTimeout(safetyTimer.current);
        safetyTimer.current = setTimeout(() => {
          setState("idle");
        }, SHOW_DELAY_MS + MIN_VISIBLE_MS + 5000);
      }, SHOW_DELAY_MS);
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      if (showTimer.current) clearTimeout(showTimer.current);
    };
  }, []);

  useEffect(() => {
    if (previousKey.current === routeKey) return;
    previousKey.current = routeKey;

    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }

    // A real navigation happened. If the bar isn't showing, there's nothing
    // to close out (e.g. browser back/forward with no preceding click).
    setState((current) => {
      if (current !== "loading") return current;

      if (safetyTimer.current) {
        clearTimeout(safetyTimer.current);
        safetyTimer.current = null;
      }

      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setState("idle");
      }, MIN_VISIBLE_MS);

      return current;
    });

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
