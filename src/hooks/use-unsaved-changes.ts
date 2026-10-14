import { useEffect } from "react";

/** Warns before a dirty form is left: the browser's own prompt on reload or
 * tab close, and a native confirm on in-app link clicks. Same approach as
 * settings-shell.tsx.
 * ponytail: the App Router has no route blocker, so browser Back and
 * router.push aren't intercepted; revisit if Next ships one. */
export function useUnsavedChanges(dirty: boolean, message: string) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest?.("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, message]);
}
