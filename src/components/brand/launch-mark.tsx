"use client";

import { useEffect, useState } from "react";
import { ApertureSweep } from "./aperture-sweep";

const SESSION_KEY = "coachly:launch-sweep-played";

function readSkip() {
  // Lazy useState initializer: runs once on the client during the initial
  // render, a pure read safe under StrictMode's double-invoke. SSR has no
  // sessionStorage, so it renders `skip=true` (static mark) on both server
  // and the client's first paint — same markup either way, since
  // ApertureSweep always renders CoachlyMark and only its effect differs by
  // `skip`. No hydration mismatch, no mounted-flag dance.
  if (typeof window === "undefined") return true;
  return window.sessionStorage.getItem(SESSION_KEY) === "1";
}

/**
 * The motion spec's "App launch" trigger (section 03): the sweep at mark
 * size, "once per cold start, never on resume, never on route change."
 *
 * A web app has no real process-lifecycle "cold start," so sessionStorage is
 * the nearest equivalent: it persists across client-side navigations within
 * a tab (satisfying "never on route change") and clears on a genuinely new
 * session/tab (satisfying "once per cold start"). A plain module-level flag
 * would reset on every full page load, which is too eager; localStorage
 * would remember across tabs/days, which is too sticky.
 */
export function LaunchMark({ size = 88, className }: { size?: number; className?: string }) {
  const [skip] = useState(readSkip);

  useEffect(() => {
    if (!skip) window.sessionStorage.setItem(SESSION_KEY, "1");
  }, [skip]);

  return <ApertureSweep size={size} className={className} skip={skip} />;
}
