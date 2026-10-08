import { useCallback, useSyncExternalStore } from "react";

const CHANGE_EVENT = "persisted-flag-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** A boolean UI preference remembered in localStorage. Read through
 * useSyncExternalStore so the server render and hydration both use
 * `fallback` and the stored value is applied right after, with no
 * mismatch and no setState-in-effect. Storage failures (private mode,
 * blocked site data) just mean the preference isn't remembered. */
export function usePersistedFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try {
        const stored = localStorage.getItem(key);
        return stored === null ? fallback : stored === "1";
      } catch {
        return fallback;
      }
    },
    () => fallback,
  );

  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // best-effort persistence only
      }
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [key],
  );

  return [value, set];
}
