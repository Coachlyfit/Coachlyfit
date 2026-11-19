"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MoonIcon, SunIcon } from "./icons";

const KEY = "cs-scheme";

/** Light / dark switch for the public site. Starts from the visitor's system
 * preference; a choice is remembered in this browser. Renders nothing when the
 * scheme is forced (the editor preview). */
export function SiteThemeToggle() {
  const t = useTranslations("site.theme");
  const ref = useRef<HTMLButtonElement>(null);
  const [dark, setDark] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>(".cs-root");
    if (!root) return;
    if (root.hasAttribute("data-locked")) {
      setLocked(true);
      return;
    }
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* storage blocked: follow the system */
    }
    if (stored === "light" || stored === "dark") root.setAttribute("data-scheme", stored);
    setDark(stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);

  if (locked) return null;

  function toggle() {
    const root = ref.current?.closest<HTMLElement>(".cs-root");
    if (!root || dark === null) return;
    const next = !dark;
    root.setAttribute("data-scheme", next ? "dark" : "light");
    try {
      localStorage.setItem(KEY, next ? "dark" : "light");
    } catch {
      /* not remembered, still switches */
    }
    setDark(next);
  }

  return (
    <button
      ref={ref}
      type="button"
      className="cs-btn cs-btn--ghost cs-btn--round"
      onClick={toggle}
      disabled={dark === null}
      aria-label={dark ? t("toLight") : t("toDark")}
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
